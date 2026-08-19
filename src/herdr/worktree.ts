import { HerdrError } from "./client.ts";
import type { Pane, Tab, Workspace } from "./types.ts";

/**
 * Opt-in isolation: a session in its own git worktree and branch.
 *
 * This uses herdr's own `worktree create` rather than `git worktree add`,
 * which means the isolated session is a whole **workspace**, not a tab beside
 * your others. That buys three things: herdr's existing path convention
 * (`<repo-parent>/worktrees/<repo>/<slug>/<repo>`, a sibling of the repo and
 * never nested inside it), registration in `herdr worktree list`, and a single
 * `herdr worktree remove --workspace <id>` for teardown later.
 */

export type WorktreeInput = {
  projectRoot: string;
  branch: string;
};

export function worktreeCreateArgs({
  projectRoot,
  branch,
}: WorktreeInput): string[] {
  return [
    "worktree",
    "create",
    "--cwd",
    projectRoot,
    "--branch",
    branch,
    // No --base: herdr branches from current HEAD, matching `git worktree add -b`.
    // No --label: herdr names the workspace, so these look like worktrees made
    // through herdr directly.
    // Not focused, same rule as tabs — flagged as an experiment, since landing
    // in an isolated workspace may still turn out to be wanted.
    "--no-focus",
  ];
}

export function worktreeOpenArgs({
  projectRoot,
  branch,
}: WorktreeInput): string[] {
  return [
    "worktree",
    "open",
    "--cwd",
    projectRoot,
    "--branch",
    branch,
    "--no-focus",
  ];
}

export type WorktreeResult = {
  workspace: Workspace;
  tab: Tab;
  rootPane: Pane;
  worktreePath: string;
  /** True when the worktree already had a live workspace, so it was just focused. */
  alreadyOpen: boolean;
};

type RawWorktreeResponse = {
  type?: string;
  already_open?: boolean;
  workspace?: Workspace;
  tab?: Tab;
  root_pane?: Pane;
  worktree?: { path?: string; branch?: string };
};

function parseWorktreeResponse(
  result: unknown,
  expected: string,
): WorktreeResult {
  const r = result as RawWorktreeResponse;

  if (r?.type !== expected || !r.workspace || !r.tab) {
    throw new HerdrError(
      "unexpected_response",
      `expected herdr to confirm ${expected}, got ${JSON.stringify(result).slice(0, 200)}`,
    );
  }

  if (!r.root_pane?.pane_id) {
    throw new HerdrError(
      "unexpected_response",
      "herdr made the worktree but reported no pane to start an agent in",
    );
  }

  if (!r.worktree?.path) {
    throw new HerdrError(
      "unexpected_response",
      "herdr made the worktree but reported no path, so it could not be recorded",
    );
  }

  return {
    workspace: r.workspace,
    tab: r.tab,
    rootPane: r.root_pane,
    worktreePath: r.worktree.path,
    alreadyOpen: r.already_open === true,
  };
}

export const parseWorktreeCreated = (result: unknown): WorktreeResult =>
  parseWorktreeResponse(result, "worktree_created");

export const parseWorktreeOpened = (result: unknown): WorktreeResult =>
  parseWorktreeResponse(result, "worktree_opened");

/**
 * Did `worktree create` fail only because the branch already exists?
 *
 * An existing branch is meant to be reused — resuming work on a branch is the
 * common case — so this specific refusal means "open it instead". Every other
 * failure is real and must surface.
 */
export function isBranchInUse(err: unknown): boolean {
  if (!(err instanceof HerdrError)) return false;
  return /already exists|already checked out|already used by worktree/i.test(
    err.message,
  );
}

export type IdentityInput = {
  /** What generateLabel produced from the branch or directory. */
  derivedLabel: string;
  requestedName?: string;
  requestedBranch?: string;
};

/**
 * In worktree mode the branch *is* the identity of the session, so the label
 * follows it. Without this the workspace reads "m4-probe" while the agent in it
 * reads "compliance" — two names for one thing, in two panels side by side.
 *
 * An explicitly-typed name still wins: if you asked for a tab called something,
 * that is what you get.
 */
export function worktreeIdentity({
  derivedLabel,
  requestedName,
  requestedBranch,
}: IdentityInput): { branch: string; label: string } {
  const branch = requestedBranch ?? derivedLabel;
  return { branch, label: requestedName ?? branch };
}
