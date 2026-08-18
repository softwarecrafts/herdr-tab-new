import { describe, expect, test } from "bun:test";
import { formatPlan, type ResolvedPlan } from "../../src/cli/output.ts";
import type { Workspace } from "../../src/herdr/types.ts";

const compliance: Workspace = {
  workspace_id: "w2",
  label: "compliance",
  focused: false,
  tab_count: 1,
  pane_count: 1,
};

const plan = (overrides: Partial<ResolvedPlan> = {}): ResolvedPlan => ({
  sessionName: "default",
  socketPath: "/Users/andrew/.config/herdr/herdr.sock",
  workspace: compliance,
  label: "compliance",
  projectRoot: "/Users/andrew/hrock/src/compliance",
  branch: "main",
  rootSource: "git",
  agentKind: "claude",
  ...overrides,
});

describe("formatPlan", () => {
  test("leads with what would be created", () => {
    const out = formatPlan(plan());

    expect(out.split("\n")[0]).toBe(
      'New claude session → tab "compliance" in workspace compliance (w2)',
    );
  });

  test("shows the project root and how it was found", () => {
    // rootSource is the field that explains a wrong answer: "cwd" means both
    // Zed and git came up empty, which is nearly always the actual bug.
    const out = formatPlan(plan());

    expect(out).toContain("/Users/andrew/hrock/src/compliance");
    expect(out).toContain("from git");
  });

  test("credits Zed when Zed supplied the root", () => {
    const out = formatPlan(plan({ rootSource: "zed" }));

    expect(out).toContain("from ZED_WORKTREE_ROOT");
  });

  test("flags the fallback case, where the root is only a guess", () => {
    const out = formatPlan(plan({ rootSource: "cwd" }));

    expect(out).toContain("from the working directory");
  });

  test("names the branch", () => {
    expect(formatPlan(plan({ branch: "feat-auth" }))).toContain("feat-auth");
  });

  test("says so plainly when there is no branch", () => {
    const out = formatPlan(plan({ branch: null }));

    expect(out).toContain("no branch");
  });

  test("stays quiet about the socket on the default session", () => {
    // One session is the normal case; printing its socket every time is noise.
    const out = formatPlan(plan());

    expect(out).not.toContain("/Users/andrew/.config/herdr/herdr.sock");
  });

  test("shows the socket when a named session is in play", () => {
    // With two sessions running, targeting the wrong one is silent and
    // confusing — so this is exactly when the path earns its line.
    const out = formatPlan(
      plan({
        sessionName: "hamilton",
        socketPath:
          "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
      }),
    );

    expect(out).toContain("hamilton");
    expect(out).toContain(
      "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
    );
  });

  test("mentions how many tabs the workspace already has", () => {
    expect(formatPlan(plan())).toContain("1 existing tab");
  });

  test("pluralises the existing tab count", () => {
    const out = formatPlan(
      plan({ workspace: { ...compliance, tab_count: 3 } }),
    );

    expect(out).toContain("3 existing tabs");
  });
});
