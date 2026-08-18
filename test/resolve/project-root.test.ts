import { describe, expect, test } from "bun:test";
import { resolveProjectRoot } from "../../src/resolve/project-root.ts";

const deps = (opts: {
  dirs?: string[];
  gitRoot?: string | null;
}) => ({
  isDirectory: (path: string) => (opts.dirs ?? []).includes(path),
  gitToplevel: () => opts.gitRoot ?? null,
});

describe("resolveProjectRoot", () => {
  test("prefers ZED_WORKTREE_ROOT when Zed supplies one", () => {
    const root = resolveProjectRoot(
      { ZED_WORKTREE_ROOT: "/Users/andrew/hrock/src/compliance" },
      "/Users/andrew/hrock/src/compliance/app/models",
      deps({
        dirs: ["/Users/andrew/hrock/src/compliance"],
        gitRoot: "/Users/andrew/hrock",
      }),
    );

    expect(root).toBe("/Users/andrew/hrock/src/compliance");
  });

  test("falls back to the git root when Zed supplies nothing", () => {
    const root = resolveProjectRoot(
      {},
      "/Users/andrew/hrock/src/compliance/app",
      deps({ gitRoot: "/Users/andrew/hrock/src/compliance" }),
    );

    expect(root).toBe("/Users/andrew/hrock/src/compliance");
  });

  test("falls back to the working directory outside a git repo", () => {
    const root = resolveProjectRoot({}, "/tmp/scratch", deps({ gitRoot: null }));

    expect(root).toBe("/tmp/scratch");
  });

  test("ignores ZED_WORKTREE_ROOT when it is not a directory", () => {
    const root = resolveProjectRoot(
      { ZED_WORKTREE_ROOT: "/gone/missing" },
      "/Users/andrew/hrock",
      deps({ dirs: [], gitRoot: "/Users/andrew/hrock" }),
    );

    expect(root).toBe("/Users/andrew/hrock");
  });

  test("ignores an empty ZED_WORKTREE_ROOT", () => {
    const root = resolveProjectRoot(
      { ZED_WORKTREE_ROOT: "" },
      "/tmp/scratch",
      deps({ gitRoot: null }),
    );

    expect(root).toBe("/tmp/scratch");
  });

  test("normalises a trailing separator away", () => {
    const root = resolveProjectRoot(
      { ZED_WORKTREE_ROOT: "/Users/andrew/hrock/" },
      "/tmp",
      deps({ dirs: ["/Users/andrew/hrock/"], gitRoot: null }),
    );

    expect(root).toBe("/Users/andrew/hrock");
  });
});
