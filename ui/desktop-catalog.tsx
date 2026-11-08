import { useLayoutEffect, useRef, useState } from "react";
import type {
  DesktopCatalogAvailability,
  DesktopCatalogCursor,
  DesktopCatalogPage,
} from "../shared/desktop-catalog";
import { sessionKey } from "../shared/session-identity";
import { readDesktopCatalog } from "./client";
import "./desktop-catalog.css";

/** Separate metadata view: never becomes board runtime, observation or navigation. */
export function DesktopCatalogPanel({
  access,
}: {
  access: DesktopCatalogAvailability;
}) {
  const [host, setHost] = useState(access.hosts[0] ?? "");
  const [page, setPage] = useState<DesktopCatalogPage | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const clear = () => {
    generation.current++;
    pending.current?.abort();
    pending.current = null;
    setPage(null);
    setBusy(false);
  };
  useLayoutEffect(() => {
    clear();
    setHost(access.hosts[0] ?? "");
    setError("");
    const changed = () => {
      clear();
      setError("执行器上下文已变化，请重新确认授权；目录已清除。");
    };
    const hidden = () => {
      if (document.hidden) changed();
    };
    window.addEventListener("taskboard:host-context-changed", changed);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      generation.current++;
      pending.current?.abort();
      window.removeEventListener("taskboard:host-context-changed", changed);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, [access.grantId, access.scopeKey, access.expiresAt, access.expired]);
  const load = async (cursor?: DesktopCatalogCursor) => {
    clear();
    setError("");
    if (document.hidden || access.expired || !host) return;
    const epoch = generation.current;
    const abort = new AbortController();
    pending.current = abort;
    setBusy(true);
    try {
      const value = await readDesktopCatalog(
        host,
        access.pageSize,
        cursor,
        abort.signal,
      );
      if (
        epoch === generation.current &&
        !abort.signal.aborted &&
        !document.hidden
      )
        setPage(value);
    } catch (reason) {
      if (epoch === generation.current && !abort.signal.aborted)
        setError(
          reason instanceof Error
            ? reason.message
            : "SSH directory unavailable; no retry.",
        );
    } finally {
      if (epoch === generation.current) {
        setBusy(false);
        pending.current = null;
      }
    }
  };
  return (
    <section className="ssh-directory" aria-label="SSH 目录（非实时）">
      <h3>SSH 目录（非实时）</h3>
      <p>
        仅列出显式授权主机的保存记录，不是已连接主机自动发现。目录条目不会自动加入看板、订阅快照或打开会话；类型与实时状态尚未核验。
      </p>
      <p>
        手动读取/分页；每次尝试都可能消耗读取预算（最多 {access.maxReads}{" "}
        次）。授权到期：{access.expiresAt}。失败不自动重试。
      </p>
      <p>
        需要 Desktop 为本次调用提供真实的 caller/turn/call
        元数据；若界面回调缺少该上下文，将拒绝读取。可由操作者在指定会话中发现并调用
        taskboard_desktop_catalog，不会代你发送消息。
      </p>
      <div className="ssh-directory-controls">
        <label>
          配置主机{" "}
          <select
            aria-label="SSH 目录主机"
            value={host}
            disabled={busy}
            onChange={(event) => {
              clear();
              setError("");
              setHost(event.target.value);
            }}
          >
            {access.hosts.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || access.expired || !host}
          onClick={() => void load()}
        >
          读取目录首页
        </button>
        <button
          type="button"
          disabled={busy || access.expired || !page?.nextCursor}
          onClick={() => void load(page?.nextCursor ?? undefined)}
        >
          读取下一页
        </button>
        <button
          type="button"
          onClick={() => {
            clear();
            setError("");
          }}
        >
          清除目录
        </button>
      </div>
      {access.expired && (
        <p role="status">目录授权已过期，请由操作者配置新的有界授权。</p>
      )}
      {busy && <p role="status">正在读取授权目录…</p>}
      {error && <p role="alert">{error}</p>}
      {page && (
        <>
          <p role="status">
            本页 {page.sessions.length} 条；
            {page.nextCursor ? "仍有后续页（未自动读取）" : "无后续 cursor"}
            。列出的状态不是实时状态。
          </p>
          <ul className="ssh-directory-rows">
            {page.sessions.map((session) => (
              <li key={sessionKey(session)}>
                <strong>{session.title || session.id}</strong>
                <code>
                  {session.hostId} · {session.id}
                </code>
                <code>{session.cwd ?? "远程目录未知"}</code>
                <small>
                  目录记录状态：{session.listedState ?? "unknown"} ·
                  类型/实时性未核验 · 操作和导航禁用
                </small>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
