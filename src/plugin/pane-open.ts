/**
 * Asking herdr to open our popup.
 *
 * The action and the popup are two separate processes: herdr runs the action
 * with no terminal at all, so anything the user has to see or answer has to
 * happen in a pane. This is the argv that bridges them.
 *
 * Note what is *not* here. No --placement: `plugin pane open --placement`
 * accepts only overlay|split|tab|zoomed on 0.8.2, so naming one would silently
 * downgrade the popup declared in the manifest to a tiled pane — and popup is
 * the only placement that receives terminal input. Omitting the flag lets the
 * manifest's value stand.
 */

export type PaneOpen = {
  pluginId: string;
  entrypoint: string;
  projectRoot: string;
};

/** The variable the popup reads its project back out of. */
export const PROJECT_ENV = "HERDR_TAB_NEW_PROJECT";

export function paneOpenArgs({
  pluginId,
  entrypoint,
  projectRoot,
}: PaneOpen): string[] {
  return [
    "plugin",
    "pane",
    "open",
    "--plugin",
    pluginId,
    "--entrypoint",
    entrypoint,
    // --cwd so git commands inside the popup run against the right checkout.
    "--cwd",
    projectRoot,
    // ...and the same path again, explicitly, because --cwd alone is not
    // enough: the popup receives its own plugin context describing whatever
    // workspace is focused when it opens, and that context outranks cwd. The
    // action has already decided which project this is; it says so rather than
    // letting the popup decide again and possibly differently.
    "--env",
    `${PROJECT_ENV}=${projectRoot}`,
  ];
}
