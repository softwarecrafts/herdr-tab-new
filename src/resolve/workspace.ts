import { resolve, sep } from "node:path";
import type { Pane, Workspace } from "../herdr/types.ts";

/**
 * Which herdr workspace does this project belong to?
 *
 * herdr does not record a directory against a workspace — only against its
 * panes. So the mapping is project root -> pane cwds -> workspace.
 *
 * A pane counts as belonging to the project when it sits AT the project root or
 * anywhere beneath it. A pane ABOVE the project never counts: the `~` workspace
 * at /Users/andrew is an ancestor of every project on this machine, and would
 * otherwise match all of them.
 */

export class NoWorkspaceMatchError extends Error {
  constructor(readonly projectRoot: string) {
    super(`no live herdr workspace has a pane in ${projectRoot}`);
    this.name = "NoWorkspaceMatchError";
  }
}

export class AmbiguousWorkspaceError extends Error {
  constructor(
    readonly projectRoot: string,
    readonly candidates: Workspace[],
  ) {
    const labels = candidates.map((w) => `${w.label} (${w.workspace_id})`);
    super(
      `${candidates.length} workspaces have a pane in ${projectRoot} and none is focused: ${labels.join(", ")}`,
    );
    this.name = "AmbiguousWorkspaceError";
  }
}

export class UnknownWorkspaceError extends Error {
  constructor(readonly requested: string) {
    super(`no workspace matches "${requested}" by id or label`);
    this.name = "UnknownWorkspaceError";
  }
}

function isAtOrBeneath(candidate: string, root: string): boolean {
  const a = resolve(candidate);
  const b = resolve(root);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
}

export function matchWorkspaces(panes: Pane[], projectRoot: string): string[] {
  const matched: string[] = [];

  for (const pane of panes) {
    if (!pane.cwd || !isAtOrBeneath(pane.cwd, projectRoot)) continue;
    if (!matched.includes(pane.workspace_id)) matched.push(pane.workspace_id);
  }

  return matched;
}

export function chooseWorkspace(
  candidateIds: string[],
  workspaces: Workspace[],
  requested?: string,
  projectRoot = "",
): Workspace {
  if (requested) {
    const found = workspaces.find(
      (w) => w.workspace_id === requested || w.label === requested,
    );
    if (!found) throw new UnknownWorkspaceError(requested);
    return found;
  }

  const candidates = candidateIds
    .map((id) => workspaces.find((w) => w.workspace_id === id))
    .filter((w): w is Workspace => w !== undefined);

  if (candidates.length === 0) throw new NoWorkspaceMatchError(projectRoot);
  if (candidates.length === 1) return candidates[0]!;

  const focused = candidates.find((w) => w.focused);
  if (focused) return focused;

  throw new AmbiguousWorkspaceError(projectRoot, candidates);
}
