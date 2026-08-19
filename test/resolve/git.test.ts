import { describe, expect, test } from "bun:test";
import { assertGitRepo, NotAGitRepoError } from "../../src/resolve/git.ts";

describe("assertGitRepo", () => {
  test("accepts a directory inside a git repo", () => {
    expect(() =>
      assertGitRepo(
        "/Users/andrew/hrock/src/compliance",
        "/Users/andrew/hrock/src/compliance",
      ),
    ).not.toThrow();
  });

  test("refuses when there is no repo", () => {
    // Checked before any herdr call: herdr would create the workspace first and
    // only then discover there is nothing to branch, leaving a stray workspace.
    expect(() => assertGitRepo("/tmp/scratch", null)).toThrow(NotAGitRepoError);
  });

  test("names the directory it looked in", () => {
    try {
      assertGitRepo("/tmp/scratch", null);
      throw new Error("expected assertGitRepo to throw");
    } catch (err) {
      expect((err as Error).message).toContain("/tmp/scratch");
    }
  });

  test("explains that worktree mode is what needs a repo", () => {
    try {
      assertGitRepo("/tmp/scratch", null);
      throw new Error("expected assertGitRepo to throw");
    } catch (err) {
      expect((err as Error).message).toMatch(/worktree/i);
    }
  });
});
