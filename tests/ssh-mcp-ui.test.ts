import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Socket } from "node:net";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { JSDOM, VirtualConsole } from "jsdom";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { sessionKey } from "../shared/session-identity";
import { columnFor, type Snapshot } from "../shared/types";

const id = "00000000-0000-4000-8000-000000000001";
const agentId = "00000000-0000-4000-8000-000000000002";
const hostId = "fixture-ssh";
const remoteKey = sessionKey({ id, hostId });
const monitorHost = "fixture-monitor-host";
// Use a different source/target UUID: the traced Desktop wait handler rejects
// its caller ID even on another host. The target still collides with local 10.
const monitorId = "00000000-0000-4000-8000-000000000010";
const monitorKey = sessionKey({ id: monitorId, hostId: monitorHost });

async function until(check: () => boolean | Promise<boolean>) {
  const deadline = Date.now() + 5000;
  while (!(await check())) {
    assert.ok(Date.now() < deadline, "MCP/UI fixture did not converge");
    await new Promise((ok) => setTimeout(ok, 10));
  }
}

function frame(message: object) {
  const body = Buffer.from(JSON.stringify(message));
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}

for (const { packaged, actions } of [
  { packaged: false, actions: false },
  { packaged: true, actions: false },
  { packaged: false, actions: true },
  { packaged: true, actions: true },
]) {
  test(
    (packaged ? "repository distribution" : "source build") +
      " MCP/UI observes SSH through filtered reconnects and host-safe collections; action policy=" +
      (actions ? "default-enabled" : "explicit-read-only"),
    { timeout: 60000 },
    async (t) => {
      const home = await mkdtemp(join(tmpdir(), "kanban-ssh-ui-"));
      const codexHome = join(home, "codex");
      await mkdir(join(codexHome, "ipc"), { recursive: true });
      const database = new DatabaseSync(join(codexHome, "state_5.sqlite"));
      database.exec(
        "CREATE TABLE threads(id TEXT, title TEXT, cwd TEXT, rollout_path TEXT, updated_at INTEGER, source TEXT, thread_source TEXT, archived INTEGER)",
      );
      database
        .prepare("INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)")
        .run(id, "Fixture local", home, null, 1800000000, "vscode", "user", 0);
      const newerLocals: string[] = [];
      for (let i = 10; i < 26; i++) {
        const localId = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
        newerLocals.push(localId);
        const path = join(home, `fixture-${i}.jsonl`);
        await writeFile(
          path,
          JSON.stringify({
            timestamp: "2026-11-07T00:00:00.000Z",
            type: "event_msg",
            payload: {
              type: "user_message",
              message: "Fixture newer local input",
            },
          }) + "\n",
        );
        database
          .prepare("INSERT INTO threads VALUES(?,?,?,?,?,?,?,?)")
          .run(
            localId,
            `Newer local ${i}`,
            home,
            path,
            1800000000 + i,
            "vscode",
            "user",
            0,
          );
      }
      database.close();

      const messages: any[] = [];
      const sockets: Socket[] = [];
      const states = new Map<string, any>([
        [
          id,
          {
            title: "Fixture local",
            cwd: home,
            gitInfo: { branch: "fixture-local-snapshot-ignored" },
            threadRuntimeStatus: { type: "idle" },
          },
        ],
        [
          remoteKey,
          {
            title: "Fixture remote ordinary",
            cwd: "/REMOTE_NOT_LOCAL",
            threadRuntimeStatus: { type: "active", activeFlags: [] },
            latestCollaborationMode: { mode: "plan" },
            gitInfo: {
              branch: "fixture/recorded-ssh-branch",
              sha: "a".repeat(40),
              originUrl: "ssh://PRIVATE_ORIGIN_CREDENTIAL@fixture.invalid/repo",
              isWorktree: true,
            },
            turns: [
              {
                turnId: "fixture-timing-turn",
                status: "inProgress",
                turnStartedAtMs: Date.now() - 2000,
                items: [],
              },
            ],
            latestTokenUsageInfo: { total: { totalTokens: 987654 } },
          },
        ],
        [
          monitorKey,
          {
            title: "Fixture monitoring target",
            cwd: "/REMOTE_MONITOR_NOT_LOCAL",
            threadRuntimeStatus: { type: "idle" },
          },
        ],
        [
          sessionKey({ id: agentId, hostId }),
          {
            title: "Fixture remote subagent",
            source: { subAgent: { parentThreadId: id } },
            threadRuntimeStatus: { type: "active" },
          },
        ],
      ]);
      for (const localId of newerLocals)
        states.set(localId, {
          title: "Newer local",
          cwd: home,
          threadRuntimeStatus: { type: "idle" },
        });
      const revisions = new Map<string, number>();
      let respondToFollows = true;
      const sendSnapshot = (socket: Socket, threadId: string, host: string) => {
        const key = sessionKey({ id: threadId, hostId: host });
        const state = states.get(key);
        if (!state) return;
        const revision = (revisions.get(key) ?? 0) + 1;
        revisions.set(key, revision);
        socket.write(
          frame({
            type: "broadcast",
            method: "thread-stream-state-changed",
            version: 11,
            sourceClientId: "owner-" + host,
            params: {
              hostId: host,
              conversationId: threadId,
              change: { type: "snapshot", revision, conversationState: state },
            },
          }),
        );
      };
      const server = createServer((socket) => {
        sockets.push(socket);
        let buffer = Buffer.alloc(0);
        socket.on("error", () => {});
        socket.on("data", (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          while (buffer.length >= 4) {
            const size = buffer.readUInt32LE();
            if (buffer.length < size + 4) return;
            const message = JSON.parse(buffer.subarray(4, size + 4).toString());
            buffer = buffer.subarray(size + 4);
            messages.push(message);
            if (message.method === "initialize")
              socket.write(
                frame({
                  type: "response",
                  requestId: message.requestId,
                  resultType: "success",
                  result: { clientId: "ui-observer" },
                }),
              );
            if (message.method === "thread-owner-discovery") {
              assert.ok(actions);
              assert.equal(message.version, 1);
              assert.equal(message.params.hostId, hostId);
              assert.equal(message.params.conversationId, id);
              socket.write(
                frame({
                  type: "response",
                  requestId: message.requestId,
                  resultType: "success",
                  method: message.method,
                  handledByClientId: "owner-" + hostId,
                  result: { supportsUntrustedAppInput: true },
                }),
              );
            }
            if (
              message.method === "thread-follower-command-approval-decision"
            ) {
              assert.ok(actions);
              assert.equal(message.hostId, hostId);
              assert.equal(message.version, 2);
              assert.deepEqual(message.params, {
                conversationId: id,
                requestId: 0,
                decision: "decline",
              });
              assert.equal(message.targetClientId, "owner-" + hostId);
              states.get(remoteKey).requests = [];
              socket.write(
                frame({
                  type: "response",
                  requestId: message.requestId,
                  resultType: "success",
                  method: message.method,
                  handledByClientId: "owner-" + hostId,
                  result: { ok: true },
                }),
              );
              sendSnapshot(socket, id, hostId);
            }
            if (
              respondToFollows &&
              message.method === "thread-stream-following-changed" &&
              message.params.following
            )
              sendSnapshot(
                socket,
                message.params.conversationId,
                message.params.hostId,
              );
          }
        });
      });
      await new Promise<void>((ok, fail) => {
        server.once("error", fail);
        server.listen(join(codexHome, "ipc/ipc.sock"), ok);
      });

      let root = resolve(".");
      if (packaged) {
        root = join(home, "uninstalled distribution with spaces");
        await cp(resolve("plugins/codex-kanban-plugin"), root, {
          recursive: true,
        });
      }
      const config = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))
        .mcpServers["codex-taskboard"];
      const supplied: Record<string, string> = {
        HOME: home,
        PATH: process.env.PATH ?? "",
        CODEX_HOME: codexHome,
        // Synthetic poison only: no real Desktop pipe, caller or key is read.
        CODEX_APP_TOOLS_PIPE_PATH: join(home, "unverified-app-tools.sock"),
        CODEX_APP_TOOLS_CALLER_HOST_ID: "durable",
        CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY: "unverified-fixture-key",
        NODE_REPL_HOST_SERVICES_PIPE_PATH: join(
          home,
          "unverified-services.sock",
        ),
        CODEX_BROWSER_USE_PEER_AUTHORIZATION: "1",
        TASKBOARD_SSH_SESSIONS: JSON.stringify([
          { hostId, threadId: id },
          { hostId, threadId: agentId },
          { hostId: monitorHost, threadId: monitorId },
        ]),
      };
      if (!actions) supplied.TASKBOARD_SSH_ACTIONS = "[]";
      // Model the executor allowlist. Enabled cases deliberately omit the action
      // variable to exercise the real startup default, not a fixture-only opt-in.
      const env: Record<string, string> = Object.fromEntries(
        config.env_vars
          .filter((key: string) => key in supplied)
          .map((key: string) => [key, supplied[key]]),
      );
      Object.assign(env, config.env ?? {});
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: resolve(root, config.cwd),
        env,
        stderr: "pipe",
      });
      const client = new Client({ name: "ssh-mcp-ui-fixture", version: "1" });
      let dom: JSDOM | undefined;
      try {
        assert.equal(
          env.TASKBOARD_SSH_SESSIONS,
          supplied.TASKBOARD_SSH_SESSIONS,
        );
        assert.equal(env.TASKBOARD_SSH_ACTIONS, supplied.TASKBOARD_SSH_ACTIONS);
        for (const key of [
          "CODEX_APP_TOOLS_CALLER_HOST_ID",
          "CODEX_TASK_WORKSPACE_VERIFYING_IDENTITY",
          "NODE_REPL_HOST_SERVICES_PIPE_PATH",
          "CODEX_BROWSER_USE_PEER_AUTHORIZATION",
        ]) {
          assert.equal(env[key], undefined, key);
        }
        // This field is now an explicitly staged transport, not caller authority.
        // start-mcp.sh removes it before Node unless a valid native policy is opted in.
        assert.equal(
          env.CODEX_APP_TOOLS_PIPE_PATH,
          supplied.CODEX_APP_TOOLS_PIPE_PATH,
        );
        await client.connect(transport);
        await client.callTool({ name: "taskboard_open", arguments: {} });
        const readSnapshot = async () => {
          const result = await client.callTool({
            name: "taskboard_snapshot",
            arguments: {},
          });
          assert.ok(!result.isError);
          return result.structuredContent as Snapshot;
        };
        await until(
          async () =>
            (await readSnapshot()).threads.filter(
              (thread) => thread.hostId === hostId && thread.fresh,
            ).length === 2,
        );
        const snapshot = await readSnapshot();
        const saved = await client.callTool({
          name: "taskboard_work_item_save",
          arguments: {
            title: "Fixture collection",
            description: "",
            status: "planned",
            threadIds: [id],
            checklist: [],
            links: [
              {
                label: "Fixture remote navigation blocked",
                url: `codex://threads/${id}?hostId=${hostId}`,
              },
            ],
          },
        });
        assert.ok(!saved.isError);
        const itemId = (saved.structuredContent as any).item.id;
        assert.equal(
          snapshot.threads.find(
            (thread) => thread.id === id && thread.hostId === hostId,
          )?.kind,
          "user",
        );
        assert.equal(
          snapshot.threads.find((thread) => thread.id === agentId)?.kind,
          "agent",
        );
        const tools = (await client.listTools()).tools;
        const uri = (
          tools.find((tool) => tool.name === "taskboard_open")?._meta?.ui as {
            resourceUri: string;
          }
        ).resourceUri;
        const resource = (await client.readResource({ uri })).contents[0];
        assert.ok("text" in resource);
        const errors: unknown[] = [];
        const virtualConsole = new VirtualConsole();
        virtualConsole.on("jsdomError", (error) => errors.push(error));
        dom = new JSDOM(resource.text, {
          url: "http://fixture.invalid/",
          runScripts: "outside-only",
          pretendToBeVisual: true,
          virtualConsole,
        });
        const window = dom.window;
        window.structuredClone = structuredClone;
        window.HTMLDialogElement.prototype.showModal = function () {
          this.setAttribute("open", "");
        };
        window.HTMLDialogElement.prototype.close = function () {
          this.removeAttribute("open");
        };
        const paths: string[] = [];
        const openedLinks: string[] = [];
        window.open = ((url: string) => {
          openedLinks.push(url);
          return null;
        }) as any;
        const observations: string[][] = [];
        window.matchMedia = ((query: string) => ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        })) as any;
        (window as any).ResizeObserver = class {
          observe() {}
          disconnect() {}
          unobserve() {}
        };
        window.fetch = (async (path: string, init?: RequestInit) => {
          paths.push(path);
          const input = JSON.parse(String(init?.body ?? "{}"));
          if (input.observedThreadIds)
            observations.push(input.observedThreadIds);
          let result;
          if (path === "/api/board/open")
            result = await client.callTool({
              name: "taskboard_open",
              arguments: {},
            });
          else if (path.startsWith("/api/snapshot"))
            result = await client.callTool({
              name: "taskboard_snapshot",
              arguments: input,
            });
          else if (path === "/api/confirmations/respond")
            result = await client.callTool({
              name: "taskboard_confirmation_reply",
              arguments: input,
            });
          else if (path === "/api/workspace")
            result = await client.callTool({
              name: "taskboard_workspace",
              arguments: {},
            });
          else if (path === "/api/work-items/add-thread")
            result = await client.callTool({
              name: "taskboard_work_item_add_thread",
              arguments: input,
            });
          else if (path === "/api/work-items/save")
            result = await client.callTool({
              name: "taskboard_work_item_save",
              arguments: input,
            });
          else if (path === "/api/thread-artifacts") {
            assert.ok(!input.threadIds.includes(remoteKey));
            result = await client.callTool({
              name: "taskboard_thread_artifacts",
              arguments: input,
            });
          } else throw new Error("Unexpected UI request: " + path);
          assert.ok(!result.isError, "MCP tool error for " + path);
          return { ok: true, json: async () => result.structuredContent };
        }) as any;
        window.localStorage.setItem(
          "taskboard:board-preferences",
          JSON.stringify({ view: "board", layout: "board", scope: "all" }),
        );
        // Run the exact self-contained production UI returned by this MCP runtime.
        const script = window.document.querySelector(
          'script[type="module"]',
        )!.textContent!;
        // jsdom has no module loader; substitute only the standard module URL.
        window.eval(
          script.replaceAll(
            "import.meta.url",
            JSON.stringify(window.location.href),
          ),
        );
        const cards = () => [
          ...window.document.querySelectorAll<HTMLElement>(".thread-card"),
        ];
        await until(
          () =>
            cards().length === 19 &&
            cards().some((card) =>
              card.textContent?.includes("Fixture remote ordinary"),
            ),
        );
        const remoteCard = () =>
          cards().find((card) => card.dataset.threadId === remoteKey)!;
        assert.ok(
          remoteCard().closest(".lane--green"),
          "SSH card reaches the running lane through actual board filters",
        );
        assert.ok(remoteCard().textContent?.includes("Plan mode"));
        assert.ok(remoteCard().textContent?.includes("Tokens unknown"));
        assert.ok(!remoteCard().textContent?.includes("Duration unknown"));
        const snapshotGit = () =>
          remoteCard().querySelector<HTMLElement>(".card-snapshot-git");
        assert.ok(snapshotGit()?.textContent?.includes("Thread Git metadata"));
        assert.ok(
          snapshotGit()?.textContent?.includes("fixture/recorded-ssh-branch"),
        );
        assert.match(
          snapshotGit()!.title,
          /not the remote directory's current branch, HEAD or worktree/,
        );
        assert.doesNotMatch(
          snapshotGit()!.textContent!,
          /detached HEAD|worktree/,
        );
        assert.ok(
          !window.document.body.textContent?.includes(
            "PRIVATE_ORIGIN_CREDENTIAL",
          ),
        );
        assert.ok(
          !cards()
            .find((card) => card.dataset.threadId === id)!
            .querySelector(".card-snapshot-git"),
        );
        const timingThread = snapshot.threads.find(
          (thread) => thread.id === id && thread.hostId === hostId,
        )!;
        assert.equal(timingThread.turnUsage?.id, "fixture-timing-turn");
        assert.equal(timingThread.turnUsage?.tokens, null);
        assert.equal(timingThread.lastUserMessageAt, null);
        assert.equal(timingThread.git, null);
        assert.deepEqual(timingThread.snapshotGit, {
          branch: "fixture/recorded-ssh-branch",
          sha: "a".repeat(40),
        });
        assert.equal(
          remoteCard().querySelector<HTMLButtonElement>(".thread-card-open")
            ?.disabled,
          true,
        );
        assert.match(
          remoteCard().querySelector<HTMLButtonElement>(".thread-card-open")!
            .title,
          /resume.*ownership[/]read state.*auto-answer/,
        );
        assert.ok(remoteCard().querySelector(".thread-work-items"));
        assert.ok(
          !cards().some((card) =>
            card.textContent?.includes("Fixture remote subagent"),
          ),
        );
        assert.ok(
          cards().some((card) => card.dataset.threadId === id),
          "Same-ID local card remains separate",
        );
        const click = (selector: string) => {
          const element = window.document.querySelector<HTMLElement>(selector);
          assert.ok(element, selector);
          element.click();
        };
        // Received metadata replacement, including branch-null, cannot pretend
        // to be current HEAD or execute a Git command against the remote cwd.
        states.get(remoteKey).gitInfo = { branch: null, sha: "b".repeat(40) };
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(
          () => !!snapshotGit()?.textContent?.includes("Branch unknown"),
        );
        assert.ok(snapshotGit()!.textContent?.includes("b".repeat(40)));
        assert.ok(!snapshotGit()!.textContent?.includes("detached HEAD"));
        delete states.get(remoteKey).gitInfo;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !snapshotGit());
        states.get(remoteKey).gitInfo = {
          branch: "fixture/restored-recorded-branch",
          sha: null,
        };
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(
          () =>
            !!snapshotGit()?.textContent?.includes(
              "fixture/restored-recorded-branch",
            ),
        );
        // A received successful wait displays exact cross-host graph edges, not
        // inferred target runtime or an active polling/navigation capability.
        const monitorCard = () =>
          cards().find((card) => card.dataset.threadId === monitorKey)!;
        await until(() => !!monitorCard());
        const waitItem = {
          id: "fixture-monitor-wait",
          type: "dynamicToolCall",
          namespace: "codex_app",
          tool: "wait_threads",
          status: "completed",
          success: true,
          arguments: {
            targets: [{ threadId: monitorId, hostId: monitorHost }],
            timeoutMs: 55000,
          },
          contentItems: [
            {
              type: "inputText",
              text: JSON.stringify({
                timedOut: true,
                wake: null,
                polls: [
                  {
                    thread: {
                      id: monitorId,
                      hostId: monitorHost,
                      title: "PRIVATE_RESULT_TITLE",
                    },
                    latestAssistantMessage: { text: "PRIVATE_WAIT_OUTPUT" },
                  },
                ],
              }),
            },
          ],
        };
        states.get(remoteKey).turns[0].items = [waitItem];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        const outgoingLink = () =>
          remoteCard().querySelector<HTMLAnchorElement>(".thread-monitoring a");
        const incomingLink = () =>
          monitorCard().querySelector<HTMLAnchorElement>(
            ".thread-monitoring a",
          );
        await until(() => !!outgoingLink() && !!incomingLink());
        assert.match(outgoingLink()!.textContent!, /曾等待|Waited for/);
        assert.match(incomingLink()!.textContent!, /曾被|Was waited on by/);
        assert.ok(
          outgoingLink()!.textContent?.includes("Fixture monitoring target"),
        );
        assert.ok(outgoingLink()!.textContent?.includes(monitorHost));
        assert.ok(
          incomingLink()!.textContent?.includes("Fixture remote ordinary"),
        );
        assert.equal(outgoingLink()!.getAttribute("href"), null);
        assert.equal(outgoingLink()!.getAttribute("aria-disabled"), "true");
        assert.match(outgoingLink()!.title, /SSH navigation is disabled/);
        assert.ok(!window.document.body.textContent?.includes("PRIVATE_WAIT_"));
        assert.ok(
          !window.document.body.textContent?.includes("PRIVATE_RESULT_"),
        );
        for (const localId of [id, monitorId])
          assert.ok(
            !cards()
              .find((card) => card.dataset.threadId === localId)!
              .querySelector(".thread-monitoring"),
            "Same-ID local thread has no remote graph",
          );
        outgoingLink()!.click();
        await until(
          () =>
            !!window.document
              .querySelector(".toast")
              ?.textContent?.includes("SSH navigation is disabled"),
        );
        assert.deepEqual(openedLinks, []);
        sockets.at(-1)!.write(
          frame({
            type: "broadcast",
            method: "client-status-changed",
            params: {
              clientId: "owner-" + monitorHost,
              status: "disconnected",
            },
          }),
        );
        await until(() => !outgoingLink() && !incomingLink());
        assert.equal(remoteCard().closest(".lane--green") !== null, true);
        sendSnapshot(sockets.at(-1)!, monitorId, monitorHost);
        await until(() => !!outgoingLink() && !!incomingLink());
        const originalTurn = states.get(remoteKey).turns[0];
        states.get(remoteKey).turns = [
          { turnId: "fixture-next-turn", status: "inProgress", items: [] },
        ];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !outgoingLink() && !incomingLink());
        states.get(remoteKey).turns = [{ ...originalTurn, items: [] }];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        // Exercise actual UI -> MCP -> host-routed owner transport, not just types.
        states.get(remoteKey).requests = [
          {
            id: 0,
            method: "item/commandExecution/requestApproval",
            params: {
              threadId: id,
              turnId: "fixture-turn",
              itemId: "fixture-item",
              command: "fixture command NOT EXECUTED",
              cwd: "/REMOTE_NOT_LOCAL",
              availableDecisions: ["accept", "decline"],
            },
          },
        ];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(
          async () =>
            (await readSnapshot()).threads.find(
              (t) => t.hostId === hostId && t.id === id,
            )?.remoteActionsEnabled === actions,
        );
        if (actions) {
          await until(() => !!remoteCard().querySelector(".card-confirmation"));
          assert.ok(remoteCard().textContent?.includes("Actions enabled"));
          assert.equal(
            messages.some(
              (m) =>
                m.method === "thread-owner-discovery" ||
                m.method === "thread-follower-command-approval-decision",
            ),
            false,
            "Default-enabled controls must not submit or discover an action owner before a user click",
          );
          assert.ok(
            remoteCard()
              .querySelector(".card-confirmation")!
              .textContent?.includes(hostId),
          );
          assert.ok(
            !cards()
              .find((c) => c.dataset.threadId === id)!
              .querySelector(".card-confirmation"),
          );
          [
            ...remoteCard().querySelectorAll<HTMLButtonElement>(
              ".confirmation-actions button",
            ),
          ]
            .find((b) => b.textContent?.includes("Decline"))!
            .click();
          await until(() =>
            messages.some(
              (m) => m.method === "thread-follower-command-approval-decision",
            ),
          );
          await until(() => !remoteCard().querySelector(".card-confirmation"));
        } else {
          assert.deepEqual((await readSnapshot()).confirmations?.requests, []);
          assert.ok(!remoteCard().querySelector(".card-confirmation"));
          states.get(remoteKey).requests = [];
          sendSnapshot(sockets.at(-1)!, id, hostId);
        }
        assert.equal(
          snapshot.threads.filter((thread) => thread.lastUserMessageAt).length,
          16,
        );
        // Running-only hides idle locals, then hides SSH on loss. Recovery must
        // not depend on a visible card or sharing the top-15 local allowance.
        click(".toolbar-actions button[aria-expanded]");
        await until(
          () => !!window.document.querySelector('[data-key="g:state"]'),
        );
        click('[data-key="g:state"]');
        for (const state of ["waiting", "idle", "error", "unknown"]) {
          click(`[data-key="o:state:${state}"]`);
          await new Promise((ok) => setTimeout(ok, 20));
        }
        await until(() => cards().length === 1);
        respondToFollows = false;
        sockets.at(-1)!.destroy();
        await until(() => cards().length === 0);
        assert.equal(
          (await readSnapshot()).threads.find(
            (thread) => thread.id === id && thread.hostId === hostId,
          )?.turnUsage,
          null,
        );
        const lostAt = observations.length;
        await until(
          () =>
            observations.length > lostAt &&
            observations.at(-1)!.includes(remoteKey),
        );
        assert.equal(
          observations.at(-1)!.filter((key) => !key.startsWith("ssh:")).length,
          15,
        );
        await until(() => sockets.length === 2);
        respondToFollows = true;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        await until(
          () => !remoteCard().textContent?.includes("Duration unknown"),
        );
        // Attention scope hides a disconnected unread card too.
        states.get(remoteKey).hasUnreadTurn = true;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        [...window.document.querySelectorAll<HTMLElement>("button")]
          .find((button) => button.textContent?.includes("Needs attention"))!
          .click();
        await until(() => !!remoteCard()?.closest(".lane--blue"));
        sockets.at(-1)!.write(
          frame({
            type: "broadcast",
            method: "client-status-changed",
            params: { clientId: "owner-" + hostId, status: "disconnected" },
          }),
        );
        await until(() => cards().length === 0);
        const attentionLost = observations.length;
        await until(
          () =>
            observations.length > attentionLost &&
            observations.at(-1)!.includes(remoteKey),
        );
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--blue"));
        [...window.document.querySelectorAll<HTMLElement>("button")]
          .find((button) => button.textContent?.includes("All conversations"))!
          .click();
        delete states.get(remoteKey).hasUnreadTurn;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        for (const state of ["waiting", "idle", "error", "unknown"]) {
          click(`[data-key="o:state:${state}"]`);
          await new Promise((ok) => setTimeout(ok, 20));
        }
        await until(() => cards().length === 19);
        // Apply the actual UI's project and title filters before snapshot loss.
        await until(
          () => !!window.document.querySelector('[data-key="g:project"]'),
        );
        click('[data-key="g:project"]');
        await until(
          () =>
            !!window.document.querySelector(
              '[data-key="o:project:fixture-ssh · /REMOTE_NOT_LOCAL"]',
            ),
        );
        click('[data-key="o:project:fixture-ssh · /REMOTE_NOT_LOCAL"]');
        const input =
          window.document.querySelector<HTMLInputElement>(".search input")!;
        Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          "value",
        )!.set!.call(input, "Fixture remote ordinary");
        input.dispatchEvent(new window.Event("input", { bubbles: true }));
        await until(() => cards().length === 1);
        const setSearch = (value: string) => {
          Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype,
            "value",
          )!.set!.call(input, value);
          input.dispatchEvent(new window.Event("input", { bubbles: true }));
        };
        setSearch("no-matching-fixture-title");
        await until(() => cards().length === 0);
        setSearch("Fixture remote ordinary");
        await until(() => cards().length === 1);
        states.get(remoteKey).threadRuntimeStatus = { type: "idle" };
        if (actions)
          states.get(remoteKey).requests = [
            {
              id: 0,
              method: "item/commandExecution/requestApproval",
              params: {
                threadId: id,
                command: "fixture stale request NOT EXECUTED",
                availableDecisions: ["decline"],
              },
            },
          ];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard().closest(".lane--gray"));
        let staleReply: any;
        if (actions) {
          await until(() => !!remoteCard().querySelector(".card-confirmation"));
          const pending = (await readSnapshot()).confirmations!.requests.find(
            (r) => r.hostId === hostId,
          )!;
          staleReply = {
            id: pending.id,
            threadId: id,
            hostId,
            decision: "decline",
          };
        }
        sockets.at(-1)!.write(
          frame({
            type: "broadcast",
            method: "client-status-changed",
            params: { clientId: "owner-" + hostId, status: "disconnected" },
          }),
        );
        await until(() => !!remoteCard()?.closest(".lane--muted"));
        assert.ok(!remoteCard().querySelector(".card-confirmation"));
        const disconnected = await readSnapshot();
        assert.equal(
          disconnected.threads.find((t) => t.hostId === hostId && t.id === id)
            ?.remoteActionsEnabled,
          false,
        );
        assert.deepEqual(disconnected.confirmations?.requests, []);
        assert.equal(
          disconnected.threads.find(
            (thread) => sessionKey(thread) === remoteKey,
          )?.snapshotGit,
          null,
        );
        assert.equal(snapshotGit(), null);
        if (actions) {
          t.diagnostic("remote stale reply: submitting after owner loss");
          const before = messages.filter(
            (m) => m.method === "thread-follower-command-approval-decision",
          ).length;
          const rejected = await client.callTool(
            {
              name: "taskboard_confirmation_reply",
              arguments: staleReply,
            },
            undefined,
            { timeout: 3000 },
          );
          t.diagnostic("remote stale reply: response received");
          assert.ok(rejected.isError);
          assert.equal(
            messages.filter(
              (m) => m.method === "thread-follower-command-approval-decision",
            ).length,
            before,
          );
        }
        assert.equal(
          columnFor(
            (await readSnapshot()).threads.find(
              (thread) => thread.hostId === hostId && thread.id === id,
            )!,
          ),
          "unknown",
        );
        assert.ok(
          remoteCard().textContent?.includes("Fixture remote ordinary"),
        );
        assert.ok(remoteCard().textContent?.includes("/REMOTE_NOT_LOCAL"));
        const before = observations.length;
        await until(
          () =>
            observations.length > before &&
            observations.at(-1)!.includes(remoteKey),
        );
        states.get(remoteKey).threadRuntimeStatus = { type: "active" };
        delete states.get(remoteKey).requests;
        t.diagnostic("remote stale reply: restoring snapshot");
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        assert.ok(
          snapshotGit()?.textContent?.includes(
            "fixture/restored-recorded-branch",
          ),
        );
        // Also exercise real transport disconnect/reconnect with held snapshots.
        respondToFollows = false;
        sockets.at(-1)!.destroy();
        await until(() => !!remoteCard()?.closest(".lane--muted"));
        assert.equal(snapshotGit(), null);
        await until(() => sockets.length === 3);
        const reconnected = observations.length;
        await until(
          () =>
            observations.length > reconnected &&
            observations.at(-1)!.includes(remoteKey),
        );
        respondToFollows = true;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        assert.ok(
          snapshotGit()?.textContent?.includes(
            "fixture/restored-recorded-branch",
          ),
        );
        assert.equal(cards().length, 1);
        assert.equal(
          remoteCard().querySelector<HTMLButtonElement>(".thread-card-open")
            ?.disabled,
          true,
        );
        // Only structured question titles/failures become display summaries.
        states.get(remoteKey).turns = [
          {
            id: "fixture-turn",
            status: "completed",
            items: [
              {
                id: "fixture-question",
                type: "agentMessage",
                text: "PRIVATE_ASSISTANT",
                questions: [{ title: "Fixture read-only question?" }],
              },
            ],
          },
        ];
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--amber"));
        assert.ok(
          remoteCard().textContent?.includes("Fixture read-only question?"),
        );
        assert.equal(remoteCard().querySelector(".card-confirmation"), null);
        assert.ok(!remoteCard().textContent?.includes("PRIVATE_ASSISTANT"));
        states.get(remoteKey).turns[0].status = "failed";
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--red"));
        delete states.get(remoteKey).turns;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        // Real picker -> MCP -> plugin SQLite, scoped away from same-ID local.
        remoteCard()
          .querySelector<HTMLButtonElement>(".thread-work-item-add")!
          .click();
        await until(
          () => !!window.document.querySelector(".thread-work-item-option"),
        );
        const option = window.document.querySelector<HTMLButtonElement>(
          ".thread-work-item-option",
        )!;
        assert.equal(
          option.disabled,
          false,
          "Local association does not imply SSH association",
        );
        option.click();
        await until(
          () => !!remoteCard()?.querySelector(".thread-work-item-tag"),
        );
        const workspace = await client.callTool({
          name: "taskboard_workspace",
          arguments: {},
        });
        const data = workspace.structuredContent as any;
        assert.deepEqual(
          data.items.find((item: any) => item.id === itemId).threadIds,
          [id, remoteKey],
        );
        assert.deepEqual(
          data.linkedThreads.map(sessionKey).sort(),
          [id, remoteKey].sort(),
        );
        assert.ok(!data.discovery.pendingThreadIds.includes(remoteKey));
        click("#workspace-tab-items");
        await until(
          () => !!window.document.querySelector(".work-thread-links"),
        );
        const links = [
          ...window.document.querySelectorAll<HTMLButtonElement>(
            ".work-thread-links button",
          ),
        ];
        assert.equal(links.length, 2);
        assert.equal(links[0].disabled, false);
        assert.equal(links[1].disabled, true);
        assert.ok(links[1].textContent?.includes("Fixture remote ordinary"));
        assert.match(links[1].title, /auto-answer pending questions/);
        const manualLink = [
          ...window.document.querySelectorAll<HTMLAnchorElement>(
            ".work-artifacts a",
          ),
        ].find((link) =>
          link.textContent?.includes("Fixture remote navigation blocked"),
        )!;
        assert.ok(manualLink);
        assert.equal(manualLink.getAttribute("href"), null);
        assert.equal(manualLink.getAttribute("aria-disabled"), "true");
        assert.match(manualLink.title, /resume.*auto-answer/);
        manualLink.click();
        await until(
          () =>
            !!window.document
              .querySelector(".data-notice")
              ?.textContent?.includes("SSH navigation is disabled"),
        );
        assert.deepEqual(
          openedLinks,
          [],
          "Blocked link never reaches navigation",
        );
        window.document.querySelector<HTMLElement>(".work-card")!.click();
        await until(() => !!window.document.querySelector(".thread-picker"));
        const options = [
          ...window.document.querySelectorAll<HTMLLabelElement>(
            ".thread-picker .thread-option",
          ),
        ];
        assert.equal(
          options.filter(
            (label) => label.querySelector<HTMLInputElement>("input")?.checked,
          ).length,
          2,
        );
        assert.ok(
          options.some((label) =>
            label.textContent?.includes("Fixture remote ordinary"),
          ),
        );
        assert.ok(paths.length > 0);
        assert.deepEqual(errors, []);
        assert.ok(
          messages
            .filter((message) => message.type === "request")
            .every((message) =>
              [
                "initialize",
                ...(actions
                  ? [
                      "thread-owner-discovery",
                      "thread-follower-command-approval-decision",
                    ]
                  : []),
              ].includes(message.method),
            ),
        );
        assert.ok(
          messages.every(
            (message) =>
              !message.params?.hostId ||
              ["local", hostId, monitorHost].includes(message.params.hostId),
          ),
        );
      } finally {
        t.diagnostic("closing isolated MCP/UI fixture");
        dom?.window.close();
        await client.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((ok) => server.close(() => ok()));
        await rm(home, { recursive: true, force: true });
      }
    },
  );
}
