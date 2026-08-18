import { resolve } from "node:path";

/**
 * Where are we? Zed sets ZED_WORKTREE_ROOT in its terminals, which is the most
 * accurate answer when it exists — it is the project you have open, not merely
 * the directory you happen to have cd'd into. Everywhere else (iTerm, a shell an
 * agent is driving) we fall back to the git root, then to the cwd.
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
