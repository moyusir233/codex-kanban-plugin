import assert from "node:assert/strict";
import { test } from "node:test";
import {
  access,
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
} from "node:fs/promises";
import { createServer, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { JSDOM, VirtualConsole } from "jsdom";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { AppBridge } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";

const caller = "c0000000-0000-4000-8000-000000000001",
  thread = "d0000000-0000-4000-8000-000000000001";
const hosts = ["ssh-fixture-a", "ssh-fixture-b"];
const node = "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node";
const delay = () => new Promise((resolve) => setTimeout(resolve, 20));
async function until(check: () => boolean) {
  const end = Date.now() + 15000;
  while (!check()) {
    assert.ok(Date.now() < end, "Fixture UI timed out");
    await delay();
  }
}

for (const packaged of [false, true])
  test(
    `${packaged ? "distribution" : "source"} opt-in MCP/UI reads manual host pages without navigation, auto-observation or persistent row data`,
    { timeout: 60000 },
    async (t) => {
      try {
        await access(node);
      } catch {
        return t.skip("reviewed macOS Desktop runtime unavailable");
      }
      const home = await mkdtemp(join(tmpdir(), "catalog-ui-"));
      const sockets = new Set<Socket>();
      const nativeRequests: any[] = [];
      const native = createServer((socket) => {
        sockets.add(socket);
        socket.on("close", () => sockets.delete(socket));
        socket.on("error", () => {});
        let buffer = Buffer.alloc(0);
        const respond = (id: unknown, result: unknown) => {
          const body = Buffer.from(
            JSON.stringify({ id, jsonrpc: "2.0", result }),
          );
          const h = Buffer.alloc(4);
          h.writeUInt32LE(body.length);
          socket.write(Buffer.concat([h, body]));
        };
        socket.on("data", (chunk) => {
          buffer = Buffer.concat([buffer, chunk]);
          while (
            buffer.length >= 4 &&
            buffer.length >= 4 + buffer.readUInt32LE()
          ) {
            const size = buffer.readUInt32LE();
            const request = JSON.parse(buffer.subarray(4, 4 + size).toString());
            buffer = buffer.subarray(4 + size);
            nativeRequests.push(request);
            if (request.method === "tools/list")
              respond(request.id, {
                tools: [
                  {
                    name: "list_threads",
                    namespace: "codex_app",
                    inputSchema: {
                      type: "object",
                      properties: {
                        mode: {},
                        source: {},
                        hostId: {},
                        limit: {},
                        archived: {},
                        cursor: {},
                      },
                      required: [],
                    },
                  },
                ],
              });
            else if (request.method === "tools/call") {
              assert.equal(request.params.tool, "list_threads");
              assert.equal(request.params.hostId, "local");
              assert.equal(request.params.threadId, caller);
              const args = request.params.arguments;
              assert.equal(args.mode, "history");
              assert.equal(args.source, "codex");
              assert.equal(args.archived, false);
              assert.ok(hosts.includes(args.hostId));
              respond(request.id, {
                success: true,
                contentItems: [
                  {
                    type: "inputText",
                    text: JSON.stringify({
                      threads: [
                        {
                          id: thread,
                          kind: "codex",
                          hostId: args.hostId,
                          title: `目录记录 ${args.hostId}`,
                          cwd: "/remote/never-local",
                          status: "idle",
                          updatedAt: 123,
                          summary: "SYNTHETIC_PRIVATE_SUMMARY",
                          projectId: "SYNTHETIC_OTHER_HOST_PROJECT",
                        },
                      ],
                      nextCursor: args.cursor ? null : "next-cursor",
                    }),
                  },
                ],
              });
            } else throw new Error("Unexpected fixture native method");
          }
        });
      });
      const pipe = join(home, "native.sock");
      await new Promise<void>((ok, fail) => {
        native.once("error", fail);
        native.listen(pipe, ok);
      });
      await chmod(pipe, 0o600);
      let root = resolve(".");
      if (packaged) {
        root = join(home, "plugin");
        await cp(resolve("plugins/codex-kanban-plugin"), root, {
          recursive: true,
        });
      }
      const config = JSON.parse(await readFile(join(root, ".mcp.json"), "utf8"))
        .mcpServers["codex-taskboard"];
      const policy = {
        grantId: "e0000000-0000-4000-8000-000000000001",
        hosts,
        localCallers: [caller],
        pageSize: 10,
        maxReads: 2,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      };
      const supplied: Record<string, string> = {
        HOME: home,
        PATH: "/usr/bin:/bin",
        CODEX_HOME: home,
        CODEX_MCP_NODE_PATH: node,
        CODEX_APP_TOOLS_PIPE_PATH: pipe,
        TASKBOARD_DESKTOP_CATALOG: JSON.stringify(policy),
      };
      const env: Record<string, string> = Object.fromEntries(
        config.env_vars
          .filter((key: string) => key in supplied)
          .map((key: string) => [key, supplied[key]]),
      );
      Object.assign(env, config.env ?? {});
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        cwd: root,
        env,
        stderr: "pipe",
      });
      transport.stderr?.on("data", () => {});
      const client = new Client({
        name: "synthetic-directory-ui",
        version: "1",
      });
      let sequence = 0;
      const calls: { name: string; args: any }[] = [];
      const call = async (name: string, args: any = {}) => {
        calls.push({ name, args });
        return client.callTool({
          name,
          arguments: args,
          _meta: {
            "x-codex-turn-metadata": {
              thread_id: caller,
              turn_id: "synthetic-turn",
            },
            "openai/toolCallId": `fixture-call-${++sequence}`,
          },
        });
      };
      let dom: JSDOM | undefined, bridge: AppBridge | undefined;
      try {
        await client.connect(transport);
        const tools = (await client.listTools()).tools;
        assert.ok(
          tools.some((tool) => tool.name === "taskboard_desktop_catalog"),
        );
        const denied = await client.callTool({
          name: "taskboard_desktop_catalog",
          arguments: { hostId: hosts[0] },
        });
        assert.equal(denied.isError, true);
        assert.equal(nativeRequests.length, 0);
        const uri = (
          tools.find((tool) => tool.name === "taskboard_open")!._meta!.ui as any
        ).resourceUri;
        const resource = (await client.readResource({ uri })).contents[0];
        assert.ok("text" in resource);
        const errors: unknown[] = [];
        const console = new VirtualConsole();
        console.on("jsdomError", (error) => errors.push(error));
        dom = new JSDOM(resource.text, {
          url: "http://fixture.invalid/",
          runScripts: "outside-only",
          pretendToBeVisual: true,
          virtualConsole: console,
        });
        const window = dom.window;
        window.structuredClone = structuredClone;
        window.HTMLDialogElement.prototype.showModal = function () {
          this.setAttribute("open", "");
        };
        window.HTMLDialogElement.prototype.close = function () {
          this.removeAttribute("open");
        };
        window.matchMedia = ((query: string) => ({
          matches: false,
          media: query,
          addEventListener() {},
          removeEventListener() {},
        })) as any;
        (window as any).ResizeObserver = class {
          observe() {}
          unobserve() {}
          disconnect() {}
        };
        window.fetch = (async () => {
          throw new Error(
            "Native directory must not fall back to preview HTTP",
          );
        }) as any;
        const links: string[] = [];
        window.open = ((value: string) => {
          links.push(value);
          return null;
        }) as any;
        let hostTransport: Transport;
        const parent = {
          postMessage(message: any) {
            queueMicrotask(() => hostTransport.onmessage?.(message));
          },
        };
        Object.defineProperty(window, "parent", {
          value: parent,
          configurable: true,
        });
        hostTransport = {
          async start() {},
          async close() {},
          async send(message) {
            queueMicrotask(() =>
              window.dispatchEvent(
                new window.MessageEvent("message", {
                  data: message,
                  source: parent as any,
                }),
              ),
            );
          },
        };
        bridge = new AppBridge(
          null,
          { name: "synthetic-directory-host", version: "1" },
          { serverTools: {}, openLinks: {} },
        );
        bridge.onopenlink = async ({ url }) => {
          links.push(url);
          return {};
        };
        bridge.oncalltool = async ({ name, arguments: args }) =>
          (await call(name, args ?? {})) as any;
        await bridge.connect(hostTransport);
        const script = window.document.querySelector(
          'script[type="module"]',
        )!.textContent!;
        window.eval(
          script.replaceAll(
            "import.meta.url",
            JSON.stringify(window.location.href),
          ),
        );
        await until(() => !!window.document.querySelector(".connection-pill"));
        (
          window.document.querySelector(".connection-pill") as HTMLElement
        ).click();
        await until(() => !!window.document.querySelector(".ssh-directory"));
        assert.equal(
          nativeRequests.length,
          0,
          "Opening settings must not perform catalog reads",
        );
        const button = (text: string) =>
          [
            ...window.document.querySelectorAll<HTMLButtonElement>(
              ".ssh-directory button",
            ),
          ].find((node) => node.textContent === text)!;
        button("读取目录首页").click();
        await until(() => {
          const error = window.document.querySelector(
            ".ssh-directory [role=alert]",
          );
          assert.ok(
            !error,
            `Fixture directory failure: ${error?.textContent}; native requests=${nativeRequests.length}`,
          );
          return (
            window.document.querySelectorAll(".ssh-directory-rows li")
              .length === 1
          );
        });
        assert.equal(nativeRequests.length, 2);
        assert.ok(
          window.document
            .querySelector(".ssh-directory")!
            .textContent!.includes(hosts[0]),
        );
        assert.ok(
          !window.document.body.textContent!.includes(
            "SYNTHETIC_PRIVATE_SUMMARY",
          ),
        );
        assert.ok(
          !window.document.body.textContent!.includes(
            "SYNTHETIC_OTHER_HOST_PROJECT",
          ),
        );
        assert.equal(
          window.document.querySelectorAll(".ssh-directory a").length,
          0,
        );
        assert.equal(links.length, 0);
        assert.equal(
          window.document.querySelectorAll(".thread-card").length,
          0,
          "Directory records do not become ordinary board cards",
        );
        assert.ok(
          calls
            .filter((value) => value.name === "taskboard_snapshot")
            .every(
              (value) =>
                !JSON.stringify(value.args.observedThreadIds ?? []).includes(
                  thread,
                ),
            ),
        );
        const select = window.document.querySelector<HTMLSelectElement>(
          ".ssh-directory select",
        )!;
        select.value = hosts[1];
        select.dispatchEvent(new window.Event("change", { bubbles: true }));
        await until(
          () =>
            window.document.querySelectorAll(".ssh-directory-rows li")
              .length === 0,
        );
        assert.equal(button("读取下一页").disabled, true);
        button("读取目录首页").click();
        await until(
          () =>
            window.document.querySelectorAll(".ssh-directory-rows li")
              .length === 1,
        );
        assert.equal(nativeRequests.length, 4);
        assert.equal(nativeRequests[3].params.arguments.hostId, hosts[1]);
        button("读取下一页").click();
        await until(
          () => !!window.document.querySelector(".ssh-directory [role=alert]"),
        );
        assert.equal(
          window.document.querySelectorAll(".ssh-directory-rows li").length,
          0,
        );
        assert.equal(
          nativeRequests.length,
          4,
          "Budget exhaustion cannot send another native request",
        );
        assert.ok(
          window.document
            .querySelector(".ssh-directory [role=alert]")!
            .textContent!.includes("read-budget-exhausted"),
        );
        assert.ok(
          !window.localStorage
            .getItem("taskboard:last-snapshot")
            ?.includes("目录记录"),
        );
        assert.deepEqual(errors, []);
      } finally {
        dom?.window.close();
        await bridge?.close();
        await client.close();
        for (const socket of sockets) socket.destroy();
        await new Promise<void>((ok) => native.close(() => ok()));
        await rm(home, { recursive: true, force: true });
      }
    },
  );
