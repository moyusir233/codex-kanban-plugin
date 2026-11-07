import { ArrowUpRight } from "lucide-react";
import type { Thread } from "../shared/types";
import { openConversation, SSH_NAVIGATION_DISABLED } from "./client";
import { isLocalSession, sessionKey } from "../shared/session-identity";
import { useI18n } from "./i18n";

/** 本地关系保留跳转；SSH 仅展示最新快照中的历史等待证据。 */
export function ThreadMonitoring({
  thread,
  onError,
}: {
  thread: Pick<Thread, "hostId" | "monitoring" | "monitoredBy">;
  onError: (message: string) => void;
}) {
  const { t } = useI18n();
  const remote = !isLocalSession(thread);
  const relations = [
    ...(thread.monitoring ?? []).map((target) => ({
      ...target,
      direction: "outgoing",
      label: t(remote ? "曾等待 {title}" : "监听 {title}", {
        title: target.title,
      }),
    })),
    ...(thread.monitoredBy ?? []).map((source) => ({
      ...source,
      direction: "incoming",
      label: t(remote ? "曾被 {title} 等待" : "被 {title} 监听", {
        title: source.title,
      }),
    })),
  ];
  if (!relations.length) return null;

  return (
    <ul className="thread-monitoring" aria-label={t("监听关系")}>
      {relations.map((relation) => {
        const local = isLocalSession(thread) && isLocalSession(relation);
        return (
          <li key={`${relation.direction}:${sessionKey(relation)}`}>
            <a
              href={local ? `codex://threads/${relation.id}` : undefined}
              aria-disabled={!local || undefined}
              title={local ? relation.label : SSH_NAVIGATION_DISABLED}
              onClick={(event) => {
                event.preventDefault();
                if (!local) {
                  onError(SSH_NAVIGATION_DISABLED);
                  return;
                }
                // 由宿主打开对话，避免在看板 iframe 内导航。
                void openConversation(relation.id, relation.hostId).catch(
                  (reason) =>
                    onError(
                      reason instanceof Error ? reason.message : "无法打开对话",
                    ),
                );
              }}
            >
              <span>
                {relation.label}
                {!local && ` · ${relation.hostId ?? thread.hostId}`}
              </span>
              <ArrowUpRight size={12} aria-hidden="true" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
