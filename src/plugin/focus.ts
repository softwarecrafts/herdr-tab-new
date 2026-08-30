import type { Pane } from "../herdr/types.ts";

/**
 * Bringing a session to the front from inside herdr.
 *
 * The sibling of attachArgs, and the reason there are two of them. From a
 * terminal the tool hands its own TTY over with `agent attach --takeover`;
 * inside herdr that would be wrong even if it worked — herdr sets HERDR_ENV in
 * everything it spawns, which is exactly why shouldAttach already refuses
 * there. The equivalent move in herdr is to focus what you want to look at.
 *
 * It takes two calls. `herdr pane focus` only moves to a *neighbour* — it
 * requires a --direction and cannot be pointed at an arbitrary pane — so the
 * closest herdr allows is the tab containing it. Focusing the workspace first
 * is not redundant: the tab may be in a workspace that is not the one on
 * screen, and focusing a workspace that is already focused costs nothing.
 *
 * The consequence worth knowing: in a tab holding several panes this focuses
 * the tab, not necessarily the pane. Every session this tool creates is the
 * root pane of its own tab, so the two coincide for anything we made.
 */
export function focusArgs(panes: Pane[], paneId: string): string[][] | null {
  const pane = panes.find((p) => p.pane_id === paneId);
  if (!pane) return null;

  return [
    ["workspace", "focus", pane.workspace_id],
    ["tab", "focus", pane.tab_id],
  ];
}
