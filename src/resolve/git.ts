/**
 * Worktree mode's one precondition.
 *
 * Checked before any herdr call: herdr would otherwise create the workspace
 * first and only then discover there is nothing to branch from, leaving a stray
 * workspace behind for a mistake we could see coming.
 */

export class NotAGitRepoError extends Error {
  constructor(readonly projectRoot: string) {
    super(
      `worktree mode needs a git repository, and ${projectRoot} is not inside one`,
    );
    this.name = "NotAGitRepoError";
  }
}

export function assertGitRepo(
  projectRoot: string,
  gitRoot: string | null,
): void {
  if (!gitRoot) throw new NotAGitRepoError(projectRoot);
}
