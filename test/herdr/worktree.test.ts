import { describe, expect, test } from "bun:test";
import {
  isBranchInUse,
  parseWorktreeCreated,
  parseWorktreeOpened,
  worktreeCreateArgs,
  worktreeIdentity,
  worktreeOpenArgs,
} from "../../src/herdr/worktree.ts";
import { HerdrError } from "../../src/herdr/client.ts";

describe("worktreeCreateArgs", () => {
  const args = worktreeCreateArgs({
    projectRoot: "/Users/andrew/hrock/src/compliance",
    branch: "m4-probe",
  });

  test("asks herdr from inside the source repo", () => {
    expect(args.slice(0, 2)).toEqual(["worktree", "create"]);
    expect(args[args.indexOf("--cwd") + 1]).toBe(
      "/Users/andrew/hrock/src/compliance",
    );
  });

  test("names the branch", () => {
    expect(args[args.indexOf("--branch") + 1]).toBe("m4-probe");
  });

  test("focuses the new workspace", () => {
    expect(args).toContain("--focus");
  });

  test("does not pass a base, so herdr branches from current HEAD", () => {
    expect(args).not.toContain("--base");
  });

  test("does not pass a label, so herdr names the workspace itself", () => {
    expect(args).not.toContain("--label");
  });
});

describe("worktreeOpenArgs", () => {
  const args = worktreeOpenArgs({
    projectRoot: "/Users/andrew/hrock/src/compliance",
    branch: "existing",
  });

  test("opens an existing branch's worktree", () => {
    expect(args.slice(0, 2)).toEqual(["worktree", "open"]);
    expect(args[args.indexOf("--branch") + 1]).toBe("existing");
  });

  test("focuses it, like create does", () => {
    expect(args).toContain("--focus");
  });
});

const created = {
  type: "worktree_created",
  workspace: { workspace_id: "w10", label: "ozone-loon" },
  tab: { tab_id: "w10:t1", workspace_id: "w10", label: "compliance" },
  root_pane: { pane_id: "w10:p1", tab_id: "w10:t1", workspace_id: "w10" },
  worktree: {
    path: "/Users/andrew/hrock/src/worktrees/compliance/ozone-loon/compliance",
    branch: "m4-probe",
  },
};

describe("parseWorktreeCreated", () => {
  test("hands back the workspace, pane and worktree path", () => {
    const result = parseWorktreeCreated(created);

    expect(result.workspace.workspace_id).toBe("w10");
    expect(result.rootPane.pane_id).toBe("w10:p1");
    expect(result.worktreePath).toBe(
      "/Users/andrew/hrock/src/worktrees/compliance/ozone-loon/compliance",
    );
  });

  test("keeps the tab, which the record needs", () => {
    expect(parseWorktreeCreated(created).tab.tab_id).toBe("w10:t1");
  });

  test("refuses a response of the wrong type", () => {
    expect(() => parseWorktreeCreated({ type: "tab_created" })).toThrow(
      HerdrError,
    );
  });

  test("refuses a response with no pane to start an agent in", () => {
    const { root_pane: _dropped, ...noPane } = created;

    expect(() => parseWorktreeCreated(noPane)).toThrow(HerdrError);
  });

  test("refuses a response with no worktree path to record", () => {
    expect(() =>
      parseWorktreeCreated({ ...created, worktree: { branch: "x" } }),
    ).toThrow(HerdrError);
  });
});

describe("parseWorktreeOpened", () => {
  test("reads the same shape from an opened worktree", () => {
    const result = parseWorktreeOpened({
      ...created,
      type: "worktree_opened",
      already_open: false,
    });

    expect(result.workspace.workspace_id).toBe("w10");
    expect(result.worktreePath).toContain("ozone-loon");
  });

  test("refuses a created response, so the two are not confused", () => {
    expect(() => parseWorktreeOpened(created)).toThrow(HerdrError);
  });
});

describe("isBranchInUse", () => {
  test("recognises a branch that already exists", () => {
    // Andrew's choice: an existing branch is reused, so create failing this way
    // means fall back to `worktree open` rather than give up.
    expect(
      isBranchInUse(
        new HerdrError("invalid_request", "branch 'feat-auth' already exists"),
      ),
    ).toBe(true);
  });

  test("recognises a branch already checked out elsewhere", () => {
    expect(
      isBranchInUse(
        new HerdrError(
          "invalid_request",
          "branch 'feat-auth' is already checked out at /some/path",
        ),
      ),
    ).toBe(true);
  });

  test("does not treat an unrelated failure as reusable", () => {
    expect(
      isBranchInUse(new HerdrError("invalid_request", "destination path exists")),
    ).toBe(false);
  });

  test("does not treat a dead server as reusable", () => {
    expect(
      isBranchInUse(
        new HerdrError("server_not_running", "no herdr server is running"),
      ),
    ).toBe(false);
  });

  test("ignores errors that are not from herdr", () => {
    expect(isBranchInUse(new Error("already exists"))).toBe(false);
  });
});

describe("parseWorktreeOpened reports whether it was already open", () => {
  const opened = { ...created, type: "worktree_opened", already_open: true };

  test("carries already_open through", () => {
    // Reopening a live worktree must focus it, not start a second agent in a
    // pane that already has one — herdr refuses that, and rightly.
    expect(parseWorktreeOpened(opened).alreadyOpen).toBe(true);
  });

  test("reports a freshly opened worktree as not already open", () => {
    expect(
      parseWorktreeOpened({ ...opened, already_open: false }).alreadyOpen,
    ).toBe(false);
  });

  test("a created worktree is never already open", () => {
    expect(parseWorktreeCreated(created).alreadyOpen).toBe(false);
  });
});

describe("worktreeIdentity", () => {
  test("names the session after the branch when a branch is given", () => {
    // Otherwise the workspace reads "m4-probe" while its agent reads
    // "compliance" — two names for one thing.
    expect(
      worktreeIdentity({ derivedLabel: "compliance", requestedBranch: "m4-probe" }),
    ).toEqual({ branch: "m4-probe", label: "m4-probe" });
  });

  test("falls back to the derived label for both when no branch is given", () => {
    expect(worktreeIdentity({ derivedLabel: "compliance" })).toEqual({
      branch: "compliance",
      label: "compliance",
    });
  });

  test("an explicit name wins over the branch for the label", () => {
    expect(
      worktreeIdentity({
        derivedLabel: "spike",
        requestedName: "spike",
        requestedBranch: "feat-x",
      }),
    ).toEqual({ branch: "feat-x", label: "spike" });
  });

  test("a positional name with no branch names both", () => {
    expect(
      worktreeIdentity({ derivedLabel: "spike", requestedName: "spike" }),
    ).toEqual({ branch: "spike", label: "spike" });
  });
});
