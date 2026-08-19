import { describe, expect, test } from "bun:test";
import { formatWorktreeCreated } from "../../src/cli/output.ts";

const summary = {
  branch: "m4-probe",
  worktreePath:
    "/Users/andrew/hrock/src/worktrees/compliance/ozone-loon/compliance",
  workspaceLabel: "ozone-loon",
  workspaceId: "w10",
  tabId: "w10:t1",
  paneId: "w10:p1",
  agentKind: "claude",
  reused: false,
};

describe("formatWorktreeCreated", () => {
  test("leads with the agent running on the branch", () => {
    const out = formatWorktreeCreated(summary);

    expect(out.split("\n")[0]).toContain("claude");
    expect(out.split("\n")[0]).toContain("m4-probe");
  });

  test("shows where the worktree actually is", () => {
    // The path is the thing you cannot guess and will need for git commands.
    expect(formatWorktreeCreated(summary)).toContain(
      "/Users/andrew/hrock/src/worktrees/compliance/ozone-loon/compliance",
    );
  });

  test("names the workspace herdr made, so you can find it in the sidebar", () => {
    const out = formatWorktreeCreated(summary);

    expect(out).toContain("ozone-loon");
    expect(out).toContain("w10");
  });

  test("says when an existing branch was reused rather than created", () => {
    expect(formatWorktreeCreated({ ...summary, reused: true })).toMatch(
      /existing branch/i,
    );
  });

  test("does not claim reuse when the branch is new", () => {
    expect(formatWorktreeCreated(summary)).not.toMatch(/existing branch/i);
  });

  test("makes clear the original checkout was untouched", () => {
    // That is the entire point of the feature, so it should be visible.
    expect(formatWorktreeCreated(summary)).toMatch(/untouched|unchanged/i);
  });
});
