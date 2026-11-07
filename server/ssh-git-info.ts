import { z } from "zod";
import type { SnapshotGitInfo } from "../shared/types.js";

const sshGitInfoSchema = z.object({
  branch: z
    .string()
    .min(1)
    .max(1024)
    .regex(/^[^\u0000-\u001f\u007f-\u009f\u2028\u2029]+$/u)
    .nullable()
    .optional(),
  sha: z
    .string()
    .regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i)
    .nullable()
    .optional(),
});

/** Only received thread metadata; never run Git, inspect cwd or expose originUrl.
 * Missing branch does not establish detached HEAD, worktree or current checkout. */
export function sshSnapshotGitInfo(value: unknown): SnapshotGitInfo | null {
  const parsed = sshGitInfoSchema.safeParse(value);
  if (!parsed.success) return null;
  const branch = parsed.data.branch ?? null;
  const sha = parsed.data.sha ?? null;
  return branch || sha ? { branch, sha } : null;
}
