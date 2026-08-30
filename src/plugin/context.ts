/**
 * What herdr tells a plugin command about where it was invoked from.
 *
 * Every plugin command is spawned by herdr with the *plugin directory* as its
 * working directory, and with none of the environment the CLI relies on:
 * ZED_WORKTREE_ROOT is absent and cwd says nothing about the project. The
 * project comes from HERDR_PLUGIN_CONTEXT_JSON instead, which herdr fills in
 * from the workspace the action fired against.
 *
 * Decoding fails soft, always. The same binary is the CLI, and a plugin context
 * that is missing or malformed has to fall through to the normal resolution
 * rather than take the process down — which is the tolerance parseRecords
 * applies to a truncated record, for the same reason.
 */

export type PluginContext = {
  workspaceId: string;
  /** The project this workspace is open on. */
  projectRoot: string;
  tabId: string | null;
  paneId: string | null;
};

type RawContext = {
  workspace_id?: unknown;
  workspace_cwd?: unknown;
  tab_id?: unknown;
  focused_pane_id?: unknown;
  worktree?: { checkout_path?: unknown } | null;
};

const str = (value: unknown): string | null =>
  typeof value === "string" && value !== "" ? value : null;

export function resolvePluginContext(
  env: Record<string, string | undefined>,
): PluginContext | null {
  const json = env.HERDR_PLUGIN_CONTEXT_JSON;
  if (!json) return null;

  let raw: RawContext;
  try {
    const parsed: unknown = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    raw = parsed as RawContext;
  } catch {
    return null;
  }

  // checkout_path first: it is the exact analogue of `git rev-parse
  // --show-toplevel`, so inside a linked worktree it is that worktree's own
  // path rather than the repository it was branched from — the project you are
  // actually in. workspace_cwd is the directory the workspace was opened at,
  // which is the right answer only when there is no git checkout to prefer.
  const projectRoot =
    str(raw.worktree?.checkout_path) ?? str(raw.workspace_cwd);
  if (!projectRoot) return null;

  const workspaceId = str(raw.workspace_id) ?? str(env.HERDR_WORKSPACE_ID);
  if (!workspaceId) return null;

  return {
    workspaceId,
    projectRoot,
    tabId: str(raw.tab_id) ?? str(env.HERDR_TAB_ID),
    paneId: str(raw.focused_pane_id) ?? str(env.HERDR_PANE_ID),
  };
}
