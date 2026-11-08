import { dirname, isAbsolute } from "node:path";

/** Only explicit synthetic overrides may cross into a fixture subprocess. */
export function fixtureEnv(
  home: string,
  overrides: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  if (!isAbsolute(home)) throw new Error("Fixture HOME must be absolute.");
  return {
    // Use the verified running Node, not an installed-plugin Node configuration.
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`,
    CODEX_MCP_NODE_PATH: process.execPath,
    ...overrides,
    HOME: home,
    CODEX_HOME: overrides.CODEX_HOME ?? home,
  };
}
