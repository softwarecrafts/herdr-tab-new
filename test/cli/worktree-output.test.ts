import { describe, expect, test } from "bun:test";
import {
  formatWorktreeCreated,
  formatWorktreePlan,
} from "../../src/cli/output.ts";

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

const plan = {
  agentKind: "claude",
  projectRoot: "/Users/andrew/hrock/src/compliance",
  branch: "m4-probe",
  label: "m4-probe",
  branchExists: false,
  sessionName: "default",
  socketPath: "/Users/andrew/.config/herdr/herdr.sock",
};

describe("formatWorktreePlan", () => {
  test("says it would start the agent on the branch in a new worktree", () => {
    const first = formatWorktreePlan(plan).split("\n")[0];

    expect(first).toMatch(/would/i);
    expect(first).toContain("claude");
    expect(first).toContain("m4-probe");
    expect(first).toMatch(/worktree/i);
  });

  test("says nothing was created, since that is what a preview promises", () => {
    expect(formatWorktreePlan(plan)).toMatch(/nothing was created/i);
  });

  test("does not invent a path: herdr chooses where the checkout goes", () => {
    const out = formatWorktreePlan(plan);

    expect(out).toMatch(/chosen by herdr/i);
    expect(out).not.toContain("/.herdr/worktrees/");
  });

  test("says a new branch would be created from the current HEAD", () => {
    expect(formatWorktreePlan(plan)).toMatch(/new.*current HEAD/i);
  });

  test("says an existing branch would be reused", () => {
    expect(formatWorktreePlan({ ...plan, branchExists: true })).toMatch(
      /existing.*reused/i,
    );
  });

  test("names the project and the workspace label", () => {
    const out = formatWorktreePlan({ ...plan, label: "custom-name" });

    expect(out).toContain("/Users/andrew/hrock/src/compliance");
    expect(out).toContain("custom-name");
  });

  test("shows the socket only for a named session, like the tab preview", () => {
    expect(formatWorktreePlan(plan)).not.toContain("herdr.sock");
    expect(
      formatWorktreePlan({ ...plan, sessionName: "hamilton", socketPath: "/x/hamilton.sock" }),
    ).toContain("/x/hamilton.sock");
  });
});
