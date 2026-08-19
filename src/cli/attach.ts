/**
 * Handing the terminal over to the session that was just created.
 *
 * The tool is run from a terminal in Zed, and the `zed` CLI can only open
 * paths — it cannot spawn a terminal running a command, and a CLI cannot
 * trigger a Zed task from outside. But this process is *already* in a Zed
 * terminal, so the way to get the new agent into Zed is to replace ourselves
 * with `herdr agent attach`. The terminal you typed the command in becomes the
 * session.
 *
 * The one case that skips it is being inside herdr already: herdr exports
 * HERDR_ENV in every pane it spawns, and if you are in herdr you can simply
 * switch tabs, so taking the terminal over would be rude rather than helpful.
 */

export type AttachMode =
  | "create"
  | "create-worktree"
  | "dry-run"
  | "list"
  | "teardown";

export type AttachInput = {
  env: Record<string, string | undefined>;
  mode: AttachMode;
  /** False when the tab exists but its agent never came up. */
  agentStarted: boolean;
};

export function shouldAttach({ env, mode, agentStarted }: AttachInput): boolean {
  if (mode !== "create" && mode !== "create-worktree") return false;
  if (!agentStarted) return false;
  return !env.HERDR_ENV;
}

export function attachArgs(paneId: string): string[] {
  return ["agent", "attach", paneId];
}
