import { spawn } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fixtureEnv } from "./fixture-env";

const root = fileURLToPath(new URL("../", import.meta.url));
const tests = join(root, "tests");
const requested = process.argv.slice(2);
const files = requested.length
  ? requested.map((file) => resolve(file))
  : (await readdir(tests))
      .filter((file) => file.endsWith(".test.ts"))
      .sort()
      .map((file) => join(tests, file));
if (
  !files.length ||
  files.some((file) => dirname(file) !== tests || !file.endsWith(".test.ts"))
)
  throw new Error(
    "Pass only tests/*.test.ts files to the isolated fixture runner.",
  );

const home = await mkdtemp(join(tmpdir(), "kanban-suite-"));
try {
  const env = fixtureEnv(home, { TMPDIR: tmpdir() });
  // This is a test executable selector, never a Desktop pipe/caller/config relay.
  if (process.env.TASKBOARD_CODEX_CLI)
    env.TASKBOARD_CODEX_CLI = process.env.TASKBOARD_CODEX_CLI;
  console.log(
    "Fixtures use isolated HOME/CODEX_HOME; Desktop identities, credentials and live targets are not inherited.",
  );
  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--test", ...files],
    {
      env,
      cwd: root,
      stdio: "inherit",
    },
  );
  process.exitCode = await new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code ?? 1));
  });
} finally {
  await rm(home, { recursive: true, force: true });
}
