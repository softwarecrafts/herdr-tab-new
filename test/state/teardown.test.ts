import { describe, expect, test } from "bun:test";
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

const wt = (over: Partial<TabRecord> = {}): TabRecord =>
  rec({
    tabId: "wA:t1",
    workspaceId: "wA",
    workspaceLabel: "feat-x",
    label: "feat-x",
    worktree: "/Users/andrew/.herdr/worktrees/compliance/feat-x",
    ...over,
  });

describe("planTeardown — what it must never do", () => {
  test("never plans anything for a tab it did not record", () => {
    // The whole safety story: teardown works from records, so a tab this tool
    // never created cannot appear in the plan however it is named.
    const plan = planTeardown({
      records: [rec({ tabId: "w2:t2" })],
      liveTabIds: ["w2:t2", "w2:t99"],
      dirtyWorktrees: [],
    });

    const touched = [...plan.closeTabs, ...plan.removeWorktrees].map(
      (r) => r.tabId,
    );
    expect(touched).toEqual(["w2:t2"]);
    expect(touched).not.toContain("w2:t99");
  });

  test("never removes a worktree with uncommitted work", () => {
    const record = wt();
    const plan = planTeardown({
      records: [record],
      liveTabIds: [record.tabId],
      dirtyWorktrees: [record.worktree!],
    });

    expect(plan.removeWorktrees).toHaveLength(0);
    expect(plan.skipped.map((s) => s.record.tabId)).toEqual([record.tabId]);
  });

  test("keeps the record of a worktree it skipped", () => {
    // Pruning it would strand the worktree: nothing would remember it existed.
    const record = wt();
    const plan = planTeardown({
      records: [record],
      liveTabIds: [record.tabId],
      dirtyWorktrees: [record.worktree!],
    });

    expect(plan.prune.map((r) => r.tabId)).not.toContain(record.tabId);
  });

  test("gives a reason for every skip", () => {
    const record = wt();
    const plan = planTeardown({
      records: [record],
      liveTabIds: [record.tabId],
      dirtyWorktrees: [record.worktree!],
    });

    expect(plan.skipped[0]?.reason).toMatch(/uncommitted|modified|untracked/i);
  });
});

describe("planTeardown — classification", () => {
  test("closes a live tab session", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: ["w2:t2"],
      dirtyWorktrees: [],
    });

    expect(plan.closeTabs.map((r) => r.label)).toEqual(["alpha"]);
    expect(plan.removeWorktrees).toHaveLength(0);
  });

  test("removes a live worktree session that is clean", () => {
    const record = wt();
    const plan = planTeardown({
      records: [record],
      liveTabIds: [record.tabId],
      dirtyWorktrees: [],
    });

    expect(plan.removeWorktrees.map((r) => r.label)).toEqual(["feat-x"]);
    expect(plan.closeTabs).toHaveLength(0);
  });

  test("prunes a record whose tab has already gone, without any herdr call", () => {
    const plan = planTeardown({
      records: [rec({ tabId: "w2:t9" })],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(plan.prune.map((r) => r.tabId)).toEqual(["w2:t9"]);
    expect(plan.closeTabs).toHaveLength(0);
    expect(plan.removeWorktrees).toHaveLength(0);
  });

  test("prunes a vanished worktree record without trying to remove it", () => {
    const record = wt();
    const plan = planTeardown({
      records: [record],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(plan.prune.map((r) => r.tabId)).toEqual([record.tabId]);
    expect(plan.removeWorktrees).toHaveLength(0);
  });

  test("everything acted on is also pruned", () => {
    const tab = rec({ tabId: "w2:t2" });
    const tree = wt();
    const plan = planTeardown({
      records: [tab, tree],
      liveTabIds: [tab.tabId, tree.tabId],
      dirtyWorktrees: [],
    });

    expect(plan.prune.map((r) => r.tabId).sort()).toEqual(["w2:t2", "wA:t1"]);
  });
});

describe("planTeardown — targeting", () => {
  const alpha = rec({ tabId: "w2:t2", label: "alpha" });
  const beta = rec({ tabId: "w2:t3", label: "beta" });

  test("a named target selects only that session", () => {
    const plan = planTeardown({
      records: [alpha, beta],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
      target: "beta",
    });

    expect(plan.closeTabs.map((r) => r.label)).toEqual(["beta"]);
  });

  test("untargeted sessions are kept, not pruned", () => {
    const plan = planTeardown({
      records: [alpha, beta],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
      target: "beta",
    });

    expect(plan.keep.map((r) => r.label)).toEqual(["alpha"]);
    expect(plan.prune.map((r) => r.label)).not.toContain("alpha");
  });

  test("a target can also be a tab id", () => {
    const plan = planTeardown({
      records: [alpha, beta],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
      target: "w2:t3",
    });

    expect(plan.closeTabs.map((r) => r.label)).toEqual(["beta"]);
  });

  test("an unmatched target plans nothing at all", () => {
    const plan = planTeardown({
      records: [alpha, beta],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
      target: "nonexistent",
    });

    expect(plan.closeTabs).toHaveLength(0);
    expect(plan.prune).toHaveLength(0);
    expect(plan.unmatchedTarget).toBe("nonexistent");
  });

  test("no target means everything", () => {
    const plan = planTeardown({
      records: [alpha, beta],
      liveTabIds: ["w2:t2", "w2:t3"],
      dirtyWorktrees: [],
    });

    expect(plan.closeTabs).toHaveLength(2);
    expect(plan.keep).toHaveLength(0);
  });

  test("reports having nothing to do on an empty record set", () => {
    const plan = planTeardown({
      records: [],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(plan.isEmpty).toBe(true);
  });

  test("is not empty when there is a record to prune", () => {
    const plan = planTeardown({
      records: [rec()],
      liveTabIds: [],
      dirtyWorktrees: [],
    });

    expect(plan.isEmpty).toBe(false);
  });
});
