import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";
import { join } from "node:path";
import { sessionKey, type SessionTarget } from "../shared/session-identity.js";

export type DesktopConversation = {
  state: any;
  ownerClientId: string;
  revision: number;
};

type Options = {
  home: string;
  onState: (
    state: "connecting" | "connected" | "disconnected",
    message?: string,
  ) => void;
  onConversation: (
    threadId: string,
    value: DesktopConversation,
    hostId: string,
  ) => void;
  onUnavailable: (threadId: string, hostId: string) => void;
  socketPath?: string;
  retryMs?: number;
};

const ownerMethods = new Set([
  "thread-follower-command-approval-decision",
  "thread-follower-file-approval-decision",
  "thread-follower-permissions-request-approval-response",
  "thread-follower-submit-user-input",
  "thread-follower-submit-mcp-server-elicitation-response",
  "thread-follower-start-turn",
  "thread-follower-steer-turn",
]);

/** 观察桌面已有对话，保持原窗口拥有运行态及确认请求。 */
export class DesktopIpc {
  private socket?: Socket;
  private stopped = true;
  private clientId?: string;
  private retry?: ReturnType<typeof setTimeout>;
  private watched = new Map<string, SessionTarget>();
  private conversations = new Map<string, DesktopConversation>();
  private pending = new Map<
    string,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
      threadId?: string;
    }
  >();

  constructor(private readonly options: Options) {}

  /** 只连接现有 socket，不创建路由器或启动新的 Codex 后端。 */
  start() {
    if (!this.stopped) return;
    this.stopped = false;
    this.connect();
  }

  /** 面板结束使用时解除观察，释放原窗口为 follower 保留的运行态。 */
  stop() {
    this.stopped = true;
    clearTimeout(this.retry);
    if (this.clientId)
      for (const target of this.watched.values()) this.follow(target, false);
    const socket = this.socket;
    this.socket = undefined;
    this.clientId = undefined;
    this.invalidateAll();
    this.rejectPending(new Error("桌面状态连接已关闭。"));
    socket?.end();
  }

  /** 只保留调用方当前需要的对话，取消订阅后立即撤下旧确认状态。 */
  watch(threadIds: (string | SessionTarget)[]) {
    const next = new Map(
      threadIds.map((value) => {
        const target =
          typeof value === "string"
            ? { hostId: "local", threadId: value }
            : value;
        return [
          sessionKey({ id: target.threadId, hostId: target.hostId }),
          target,
        ] as const;
      }),
    );
    for (const [key, target] of this.watched)
      if (!next.has(key)) {
        this.follow(target, false);
        this.invalidate(key);
      }
    for (const [key, target] of next)
      if (!this.watched.has(key)) this.follow(target, true);
    this.watched = next;
  }

  get(threadId: string, hostId = "local"): DesktopConversation | undefined {
    return this.conversations.get(sessionKey({ id: threadId, hostId }));
  }

  /** 用户明确作答后才转给当前 owner；路由成功不代表原请求已完成。 */
  requestOwner(
    threadId: string,
    method: string,
    params: object,
    hostId = "local",
  ): Promise<any> {
    // Never route remote operations, even if a caller supplies local-looking IDs.
    const parameterHost = (params as { hostId?: unknown }).hostId;
    if (
      hostId !== "local" ||
      (parameterHost !== undefined && parameterHost !== "local")
    )
      return Promise.reject(
        new Error("SSH sessions are observation-only; actions are disabled."),
      );
    const conversation = this.get(threadId);
    if (!conversation || !this.clientId)
      return Promise.reject(
        new Error("该对话的桌面连接已失效，请刷新后重试。"),
      );
    if (!ownerMethods.has(method))
      return Promise.reject(new Error("看板暂不支持此类桌面操作。"));
    return this.request(method, params, conversation.ownerClientId, threadId);
  }

  /** 重新初始化观察者身份；断线后撤销旧状态，再恢复当前订阅。 */
  private connect() {
    if (this.stopped) return;
    this.options.onState("connecting");
    const socket = createConnection(
      this.options.socketPath ?? join(this.options.home, "ipc", "ipc.sock"),
    );
    this.socket = socket;
    let buffer = Buffer.alloc(0);
    let disconnected = false;
    const lose = (message = "未连接 Codex 桌面，实时状态暂不可用。") => {
      if (disconnected || this.socket !== socket) return;
      disconnected = true;
      this.socket = undefined;
      this.clientId = undefined;
      this.invalidateAll();
      this.rejectPending(new Error(message));
      socket.destroy();
      if (!this.stopped) {
        this.options.onState("disconnected", message);
        this.retry = setTimeout(
          () => this.connect(),
          this.options.retryMs ?? 4000,
        );
      }
    };
    socket.on("connect", () => {
      void this.request("initialize", { clientType: "codex-kanban" })
        .then((result) => {
          if (this.socket !== socket) return;
          if (typeof result?.clientId !== "string")
            throw new Error("Codex 桌面返回了无效的连接身份。");
          this.clientId = result.clientId;
          this.options.onState("connected");
          for (const target of this.watched.values()) this.follow(target, true);
        })
        .catch(() => lose());
    });
    socket.on("data", (data) => {
      buffer = Buffer.concat([buffer, data]);
      try {
        while (buffer.length >= 4) {
          const size = buffer.readUInt32LE();
          if (buffer.length < size + 4) return;
          const message = JSON.parse(buffer.subarray(4, size + 4).toString());
          buffer = buffer.subarray(size + 4);
          this.receive(message);
        }
      } catch {
        lose("Codex 桌面状态协议不兼容，实时状态暂不可用。");
      }
    });
    socket.on("error", () => lose());
    socket.on("close", () => lose());
  }

  /** 按桌面窗口使用的长度帧写入，保持原协议和本地请求版本。 */
  private send(message: object) {
    if (!this.socket?.writable) return false;
    const payload = Buffer.from(JSON.stringify(message));
    const frame = Buffer.alloc(4 + payload.length);
    frame.writeUInt32LE(payload.length);
    payload.copy(frame, 4);
    this.socket.write(frame);
    return true;
  }

  /** 用独立请求 ID 等待路由回复，连接失效时统一拒绝未完成请求。 */
  private request(
    method: string,
    params: object,
    ownerClientId?: string,
    threadId?: string,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const requestId = randomUUID();
      const timer = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Codex 桌面请求超时，请刷新后确认结果。"));
      }, 5000);
      this.pending.set(requestId, {
        resolve,
        reject,
        timer,
        threadId,
      });
      if (
        !this.send({
          type: "request",
          requestId,
          sourceClientId: this.clientId ?? "initializing-client",
          version:
            method === "initialize"
              ? 0
              : method === "thread-follower-start-turn"
                ? 2
                : 1,
          method,
          params,
          ...(ownerClientId ? { targetClientId: ownerClientId } : {}),
        })
      ) {
        clearTimeout(timer);
        this.pending.delete(requestId);
        reject(new Error("桌面状态连接已断开。"));
      }
    });
  }

  /** 只声明观察关系，不请求恢复对话，也不取得执行所有权。 */
  private follow(target: SessionTarget, following: boolean) {
    if (!this.clientId) return;
    this.send({
      type: "broadcast",
      method: "thread-stream-following-changed",
      sourceClientId: this.clientId,
      version: 1,
      params: {
        conversationId: target.threadId,
        hostId: target.hostId,
        following,
      },
    });
  }

  /** 接收原窗口快照与顺序增量，原窗口离开后立即撤销其旧状态。 */
  private receive(message: any) {
    if (message.type === "client-discovery-request") {
      this.send({
        type: "client-discovery-response",
        requestId: message.requestId,
        response: { canHandle: false },
      });
      return;
    }
    if (message.type === "response") {
      const pending = this.pending.get(message.requestId);
      if (!pending) return;
      this.pending.delete(message.requestId);
      clearTimeout(pending.timer);
      if (message.resultType !== "success")
        pending.reject(new Error(message.error || "Codex 桌面处理请求失败。"));
      else pending.resolve(message.result);
      return;
    }
    if (
      message.type !== "broadcast" ||
      (message.targetClientIds &&
        !message.targetClientIds.includes(this.clientId))
    )
      return;
    if (message.method === "client-status-changed") {
      if (message.params?.status === "disconnected")
        for (const [id, value] of this.conversations)
          if (value.ownerClientId === message.params.clientId)
            this.invalidate(id);
      return;
    }
    if (message.method === "ipc-connection-reset") {
      this.invalidateAll();
      for (const target of this.watched.values()) this.follow(target, true);
      return;
    }
    if (message.method === "thread-stream-following-status-requested") {
      const { conversationId, hostId } = message.params ?? {};
      const target = this.watched.get(
        sessionKey({ id: conversationId, hostId }),
      );
      if (message.version === 1 && typeof hostId === "string" && target)
        this.follow(target, true);
      return;
    }
    if (message.method !== "thread-stream-state-changed") return;
    const { conversationId: id, hostId, change } = message.params ?? {};
    if (typeof id !== "string" || typeof hostId !== "string") return;
    const key = sessionKey({ id, hostId });
    const target = this.watched.get(key);
    if (!target) return;
    if (message.version !== 11) {
      // A remote protocol mismatch must not take local observation down.
      if (hostId !== "local") {
        this.invalidate(key);
        return;
      }
      throw new Error("unsupported-desktop-state-version");
    }
    if (typeof message.sourceClientId !== "string") return;
    const current = this.conversations.get(key);
    if (change?.type === "snapshot") {
      if (!change.conversationState || !Number.isInteger(change.revision))
        return;
      if (current && current.ownerClientId !== message.sourceClientId)
        this.invalidate(key);
      const value = {
        state: change.conversationState,
        ownerClientId: message.sourceClientId,
        revision: change.revision,
      };
      this.conversations.set(key, value);
      this.options.onConversation(id, value, hostId);
      return;
    }
    if (change?.type !== "patches" || !current) return;
    // 缺少任何一版就重新取快照，不能把旧请求或旧状态继续当成实时数据。
    if (
      current.ownerClientId !== message.sourceClientId ||
      current.revision !== change.baseRevision ||
      !Number.isInteger(change.revision) ||
      change.revision <= current.revision
    ) {
      this.invalidate(key);
      this.follow(target, true);
      return;
    }
    try {
      current.state = applyPatches(current.state, change.patches);
      current.revision = change.revision;
      this.options.onConversation(id, current, hostId);
    } catch {
      this.invalidate(key);
      this.follow(target, true);
    }
  }

  private invalidate(key: string) {
    const target = this.watched.get(key);
    if (this.conversations.delete(key) && target)
      this.options.onUnavailable(target.threadId, target.hostId);
    this.rejectPending(new Error("对话原窗口连接已失效，请刷新后重试。"), key);
  }

  private invalidateAll() {
    for (const id of this.conversations.keys()) this.invalidate(id);
  }

  private rejectPending(error: Error, threadId?: string) {
    for (const [id, pending] of this.pending)
      if (!threadId || pending.threadId === threadId) {
        clearTimeout(pending.timer);
        this.pending.delete(id);
        pending.reject(error);
      }
  }
}

/** 按 Immer 的数组路径应用增量；失败后由调用方放弃该状态并重取快照。 */
function applyPatches(state: any, patches: any[]): any {
  if (!Array.isArray(patches)) throw new Error("invalid-desktop-patches");
  for (const { op, path, value } of patches) {
    if (!Array.isArray(path)) throw new Error("invalid-desktop-patch-path");
    if (
      path.some((key) =>
        ["__proto__", "prototype", "constructor"].includes(key),
      )
    )
      throw new Error("unsafe-desktop-patch-path");
    if (!path.length) {
      if (op !== "replace") throw new Error("invalid-desktop-root-patch");
      state = value;
      continue;
    }
    let parent = state;
    for (const key of path.slice(0, -1)) {
      if (parent === null || typeof parent !== "object")
        throw new Error("missing-desktop-patch-parent");
      parent = parent[key];
    }
    if (parent === null || typeof parent !== "object")
      throw new Error("missing-desktop-patch-parent");
    const key = path[path.length - 1];
    if (op === "remove") {
      if (Array.isArray(parent)) parent.splice(Number(key), 1);
      else delete parent[key];
    } else if (op === "add") {
      if (Array.isArray(parent)) parent.splice(Number(key), 0, value);
      else parent[key] = value;
    } else if (op === "replace") parent[key] = value;
    else throw new Error("unsupported-desktop-patch");
  }
  return state;
}
