import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer, type Socket } from "node:net";
import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
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

for (const packaged of [false, true]) {
  test(
    (packaged ? "repository distribution" : "source build") +
      " MCP config forwards SSH opt-in and renders ordinary cards but not subagents",
    { timeout: 30000 },
    async () => {
      const home = await mkdtemp(join(tmpdir(), "kanban-ssh-ui-"));
      const codexHome = join(home, "codex");
      await mkdir(join(codexHome, "ipc"), { recursive: true });
      const database = new DatabaseSync(join(codexHome, "state_5.sqlite"));
      database.exec(
        "CREATE TABLE threads(id TEXT, title TEXT, cwd TEXT, updated_at INTEGER, source TEXT, thread_source TEXT, archived INTEGER)",
      );
      database
        .prepare("INSERT INTO threads VALUES(?,?,?,?,?,?,?)")
        .run(id, "Fixture local", home, 1800000000, "vscode", "user", 0);
      database.close();

      const messages: any[] = [];
      const sockets: Socket[] = [];
      const states = new Map<string, any>([
        [
          id,
          {
            title: "Fixture local",
            cwd: home,
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
        TASKBOARD_SSH_SESSIONS: JSON.stringify([
          { hostId, threadId: id },
          { hostId, threadId: agentId },
        ]),
      };
      // Model the executor allowlist; never hand-inject the opt-in into transport.env.
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
        const paths: string[] = [];
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
          else if (path === "/api/workspace")
            result = await client.callTool({
              name: "taskboard_workspace",
              arguments: {},
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
            cards().length === 2 &&
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
        assert.equal(
          remoteCard().querySelector<HTMLButtonElement>(".thread-card-open")
            ?.disabled,
          true,
        );
        assert.equal(remoteCard().querySelector(".thread-work-items"), null);
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
        // Apply the actual UI's project and title filters before snapshot loss.
        click(".toolbar-actions button[aria-expanded]");
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
        sendSnapshot(sockets[0], id, hostId);
        await until(() => !!remoteCard().closest(".lane--gray"));
        sockets[0].write(
          frame({
            type: "broadcast",
            method: "client-status-changed",
            params: { clientId: "owner-" + hostId, status: "disconnected" },
          }),
        );
        await until(() => !!remoteCard()?.closest(".lane--muted"));
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
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        // Also exercise real transport disconnect/reconnect with held snapshots.
        respondToFollows = false;
        sockets.at(-1)!.destroy();
        await until(() => !!remoteCard()?.closest(".lane--muted"));
        await until(() => sockets.length === 2);
        const reconnected = observations.length;
        await until(
          () =>
            observations.length > reconnected &&
            observations.at(-1)!.includes(remoteKey),
        );
        respondToFollows = true;
        sendSnapshot(sockets.at(-1)!, id, hostId);
        await until(() => !!remoteCard()?.closest(".lane--green"));
        assert.equal(cards().length, 1);
        assert.equal(
          remoteCard().querySelector<HTMLButtonElement>(".thread-card-open")
            ?.disabled,
          true,
        );
        assert.ok(paths.length > 0);
        assert.deepEqual(errors, []);
        assert.ok(
          messages
            .filter((message) => message.type === "request")
            .every((message) => message.method === "initialize"),
        );
        assert.ok(
          messages.every(
            (message) =>
              !message.params?.hostId ||
              ["local", hostId].includes(message.params.hostId),
          ),
        );
      } finally {
        dom?.window.close();
        await client.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((ok) => server.close(() => ok()));
        await rm(home, { recursive: true, force: true });
      }
    },
  );
}
