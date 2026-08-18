import { basename } from "node:path";

/**
 * What should the new tab be called?
 *
 * The branch is the most useful thing to see in a tab bar — it says what the
 * session is *for*. Off a branch (detached HEAD, or not a repo at all) the
 * directory name is the next best answer.
 *
 * Note this is only a good starting point, not a guarantee: tab auto-naming
 * plugins exist that rename tabs from the agent's own conversation, and would
 * overwrite whatever we set. Nothing downstream should depend on this name.
 */

export type LabelInput = {
  branch: string | null;
  projectRoot: string;
  existingLabels: string[];
  requested?: string;
};

/**
 * Most new work starts on the default branch, so naming a tab after it gives
 * every project a tab called "main". The project name is the more useful answer
 * there; a branch only earns the name when it says something the workspace does
 * not already.
 */
const DEFAULT_BRANCHES = new Set(["main", "master"]);

export function generateLabel({
  branch,
  projectRoot,
  existingLabels,
  requested,
}: LabelInput): string {
  const namedBranch = branch && !DEFAULT_BRANCHES.has(branch) ? branch : null;
  const base = requested || namedBranch || basename(projectRoot);

  if (!existingLabels.includes(base)) return base;

  let counter = 2;
  while (existingLabels.includes(`${base}-${counter}`)) counter += 1;

  return `${base}-${counter}`;
}
