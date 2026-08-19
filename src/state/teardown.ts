import type { TabRecord } from "./record.ts";

/**
 * Deciding what teardown will do — and, more importantly, what it will not.
 *
 * This is the only milestone that destroys anything, so the whole decision is
 * made here as a pure function over data: the records, which tabs herdr still
 * has, which worktrees have uncommitted work, and an optional target. Nothing
 * in this file can call herdr or git, which is what makes every safety property
 * testable without either.
 *
 * Two invariants matter above the rest:
 *
 *   1. Teardown works from the records, so a tab this tool never created cannot
 *      appear in the plan however it happens to be named.
 *   2. A worktree with uncommitted work is skipped AND its record is kept —
 *      pruning it would strand the worktree with nothing remembering it exists.
 */

export type SkippedRecord = {
  record: TabRecord;
  reason: string;
};

export type TeardownPlan = {
  /** Live tab sessions to close. */
  closeTabs: TabRecord[];
  /** Live worktree sessions that are clean enough to remove. */
  removeWorktrees: TabRecord[];
  /** Left alone, with the reason why. Their records are kept. */
  skipped: SkippedRecord[];
  /** Records to drop: everything acted on, plus tabs that had already gone. */
  prune: TabRecord[];
  /** Records outside the target, untouched and unpruned. */
  keep: TabRecord[];
  /** Set when a target was given and matched nothing. */
  unmatchedTarget?: string;
  isEmpty: boolean;
};

export type TeardownInput = {
  records: TabRecord[];
  liveTabIds: string[];
  /** Worktree paths found to have uncommitted work. */
  dirtyWorktrees: string[];
  /** A tab label or tab id. Absent means every record in this session. */
  target?: string;
};

const matches = (r: TabRecord, target: string) =>
  r.label === target || r.tabId === target;

export function planTeardown({
  records,
  liveTabIds,
  dirtyWorktrees,
  target,
}: TeardownInput): TeardownPlan {
  const targeted = target
    ? records.filter((r) => matches(r, target))
    : records;
  const keep = target ? records.filter((r) => !matches(r, target)) : [];

  const closeTabs: TabRecord[] = [];
  const removeWorktrees: TabRecord[] = [];
  const skipped: SkippedRecord[] = [];
  const prune: TabRecord[] = [];

  for (const record of targeted) {
    // Already gone: nothing to ask herdr for, just forget it.
    if (!liveTabIds.includes(record.tabId)) {
      prune.push(record);
      continue;
    }

    if (record.worktree === null) {
      closeTabs.push(record);
      prune.push(record);
      continue;
    }

    if (dirtyWorktrees.includes(record.worktree)) {
      skipped.push({
        record,
        reason: "the worktree has uncommitted or untracked changes",
      });
      continue;
    }

    removeWorktrees.push(record);
    prune.push(record);
  }

  const plan: TeardownPlan = {
    closeTabs,
    removeWorktrees,
    skipped,
    prune,
    keep,
    isEmpty:
      closeTabs.length === 0 &&
      removeWorktrees.length === 0 &&
      skipped.length === 0 &&
      prune.length === 0,
  };

  if (target && targeted.length === 0) plan.unmatchedTarget = target;

  return plan;
}
