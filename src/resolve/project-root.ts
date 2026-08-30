import { resolve } from "node:path";
import { resolvePluginContext } from "../plugin/context.ts";
import { PROJECT_ENV } from "../plugin/pane-open.ts";

/**
 * Where are we? Zed sets ZED_WORKTREE_ROOT in its terminals, which is the most
 * accurate answer when it exists — it is the project you have open, not merely
 * the directory you happen to have cd'd into. Everywhere else (iTerm, a shell an
 * agent is driving) we fall back to the git root, then to the cwd.
 *
 * Running as a herdr plugin outranks all of it. herdr spawns plugin commands
 * with the plugin directory as their cwd, so neither the git root nor the cwd
 * describes a project at all — but it also hands over the workspace the action
 * fired against, which is the answer directly.
 */

export type ProjectRootDeps = {
  isDirectory: (path: string) => boolean;
  gitToplevel: (cwd: string) => string | null;
};

export function resolveProjectRoot(
  env: Record<string, string | undefined>,
  cwd: string,
  deps: ProjectRootDeps,
): string {
  // Ahead of even the plugin context: when the action opened the popup it had
  // already resolved the project, and it passes that decision through rather
  // than letting the popup resolve it a second time against its own context.
  const explicit = env[PROJECT_ENV];
  if (explicit) {
    return resolve(explicit);
  }

  // Ahead of Zed, not merely ahead of git. Plugin commands are spawned by the
  // herdr *server*, which inherits the environment of whatever started it —
  // start herdr from a Zed terminal and ZED_WORKTREE_ROOT leaks into every
  // plugin command in every workspace, naming one project while the action
  // fired against another.
  //
  // Deliberately not gated on isDirectory: if herdr names a directory that has
  // gone, failing to match a workspace is a clear error, whereas falling back
  // would silently open a session in whatever project the stale variable named.
  const fromPlugin = resolvePluginContext(env);
  if (fromPlugin) {
    return resolve(fromPlugin.projectRoot);
  }

  const fromZed = env.ZED_WORKTREE_ROOT;
  if (fromZed && deps.isDirectory(fromZed)) {
    return resolve(fromZed);
  }

  const fromGit = deps.gitToplevel(cwd);
  if (fromGit) {
    return resolve(fromGit);
  }

  return resolve(cwd);
}
