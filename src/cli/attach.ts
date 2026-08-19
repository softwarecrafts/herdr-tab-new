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

/**
 * `--takeover` is not optional here, though it looks like it should be.
 *
 * Without it the attach connects but does not own input — nothing typed reaches
 * the agent, and the prefix key is not processed either. herdr's docs describe
 * the flag as how a client claims input when something else already holds it,
 * which is exactly the state attaching from an editor terminal lands in.
 * Confirmed by trying both.
 */
export function attachArgs(paneId: string): string[] {
  return ["agent", "attach", paneId, "--takeover"];
}

/**
 * An OSC 2 sequence naming the terminal window.
 *
 * Zed titles a terminal tab after its foreground process when nothing sets a
 * title explicitly — which meant every attached session read "herdr-tab-new",
 * saying nothing about which session it was. Emitting the session label first
 * gives it a real name, and the agent's own title supersedes this the moment it
 * paints one, which is the wanted outcome.
 *
 * Control characters are stripped: a stray BEL or ESC inside a label would
 * terminate the sequence early and spill the remainder onto the screen.
 */
export function titleEscape(label: string): string {
  const clean = label.replace(/[\x00-\x1f\x7f]/g, "");
  return clean ? `\x1b]2;${clean}\x07` : "";
}
