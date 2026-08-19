import { describe, expect, test } from "bun:test";
import {
  formatTeardownPlan,
  formatTeardownResult,
} from "../../src/cli/output.ts";
import { planTeardown } from "../../src/state/teardown.ts";
import type { TabRecord } from "../../src/state/record.ts";

const rec = (over: Partial<TabRecord> = {}): TabRecord => ({
  session: "default",
  workspaceId: "w2",
  workspaceLabel: "compliance",
  tabId: "w2:t2",
  label: "alpha",
  directory: "/Users/andrew/hrock/src/compliance",
  agentKind: "claude",
  agentStarted: true,
  worktree: null,
  created: "2026-08-19T10:00:00.000Z",
  ...over,
});

const dirtyTree = rec({
  tabId: "wA:t1",
  label: "feat-x",
  worktree: "/Users/andrew/.herdr/worktrees/compliance/feat-x",
});

describe("formatTeardownPlan", () => {
  test("makes clear nothing has happened yet", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: ["w2:t2"],
      dirtyWorktrees: [],
    });

    expect(formatTeardownPlan(plan)).toMatch(/would|dry run/i);
  });

  test("names the tabs it would close", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: ["w2:t2"],
      dirtyWorktrees: [],
    });

    expect(formatTeardownPlan(plan)).toContain("alpha");
  });

  test("names a worktree it would skip, and why", () => {
    const plan = planTeardown({
      records: [dirtyTree],
      liveTabIds: ["wA:t1"],
      dirtyWorktrees: [dirtyTree.worktree!],
    });
    const out = formatTeardownPlan(plan);

    expect(out).toContain("feat-x");
    expect(out).toMatch(/uncommitted|untracked/i);
  });

  test("says branches are left alone whenever a worktree is involved", () => {
    // Milestone 4 established that removing a worktree keeps its branch. Saying
    // so stops it reading as though the branch went too.
    const clean = rec({
      tabId: "wA:t1",
      label: "feat-x",
      worktree: "/Users/andrew/.herdr/worktrees/compliance/feat-x",
    });
    const plan = planTeardown({
      records: [clean],
      liveTabIds: ["wA:t1"],
      dirtyWorktrees: [],
    });

    expect(formatTeardownPlan(plan)).toMatch(/branch/i);
  });

  test("does not mention branches when only tabs are involved", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: ["w2:t2"],
      dirtyWorktrees: [],
    });

    expect(formatTeardownPlan(plan)).not.toMatch(/branch/i);
  });

  test("says plainly when there is nothing to do", () => {
    const plan = planTeardown({
      records: [],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(formatTeardownPlan(plan)).toMatch(/nothing/i);
  });

  test("reports a target that matched nothing", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: ["w2:t2"],
      dirtyWorktrees: [],
      target: "typo",
    });

    expect(formatTeardownPlan(plan)).toContain("typo");
  });
});

describe("formatTeardownResult", () => {
  test("counts what it actually did", () => {
    const plan = planTeardown({
      records: [rec(), rec({ tabId: "w2:t3", label: "beta" })],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
    });

    const out = formatTeardownResult(plan);
    expect(out).toContain("2");
    expect(out).toMatch(/closed/i);
  });

  test("reports skipped sessions in the summary too", () => {
    // A skip is the outcome most worth surfacing — it means work is still there.
    const plan = planTeardown({
      records: [dirtyTree],
      liveTabIds: ["wA:t1"],
      dirtyWorktrees: [dirtyTree.worktree!],
    });

    expect(formatTeardownResult(plan)).toMatch(/skipped|left alone/i);
  });

  test("mentions stale records it tidied away", () => {
    const plan = planTeardown({
      records: [rec({ tabId: "w2:t9" })],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(formatTeardownResult(plan)).toMatch(/record/i);
  });

  test("says nothing needed doing when that is the case", () => {
    const plan = planTeardown({
      records: [],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(formatTeardownResult(plan)).toMatch(/nothing/i);
  });
});
