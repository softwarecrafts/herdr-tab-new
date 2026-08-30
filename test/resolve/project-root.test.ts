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

  test("prefers the herdr plugin context over everything else", () => {
    const root = resolveProjectRoot(
      {
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
          workspace_id: "wC",
          workspace_cwd: "/Users/andrew/src/herdr-tab-new",
        }),
        ZED_WORKTREE_ROOT: "/Users/andrew/hrock/src/compliance",
      },
      "/private/tmp/plugin-root",
      deps({
        dirs: ["/Users/andrew/hrock/src/compliance"],
        gitRoot: null,
      }),
    );

    expect(root).toBe("/Users/andrew/src/herdr-tab-new");
  });

  test("outranks a ZED_WORKTREE_ROOT the herdr server inherited", () => {
    // Plugin commands are spawned by the herdr *server*, which inherits the
    // environment of whatever started it. Start herdr from a Zed terminal and
    // ZED_WORKTREE_ROOT leaks into every plugin command in every workspace —
    // naming one project while the action fired against another. The context
    // herdr computed for this invocation is the only trustworthy answer.
    const root = resolveProjectRoot(
      {
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
          workspace_id: "wA",
          workspace_cwd: "/Users/andrew/src/compliance",
        }),
        ZED_WORKTREE_ROOT: "/Users/andrew/src/herdr-tab-new",
      },
      "/private/tmp/plugin-root",
      deps({ dirs: ["/Users/andrew/src/herdr-tab-new"], gitRoot: null }),
    );

    expect(root).toBe("/Users/andrew/src/compliance");
  });

  test("falls through to the CLI sources when the context is unusable", () => {
    // A malformed context must not strand the binary: it is the same binary the
    // CLI runs, and outside herdr this variable is simply absent.
    const root = resolveProjectRoot(
      { HERDR_PLUGIN_CONTEXT_JSON: "{not json" },
      "/Users/andrew/hrock/app",
      deps({ gitRoot: "/Users/andrew/hrock" }),
    );

    expect(root).toBe("/Users/andrew/hrock");
  });

  test("lets the action hand the popup an explicit project root", () => {
    // The popup pane gets its own plugin context, describing whatever workspace
    // is focused when it opens — which need not be the workspace the action
    // fired against. The action has already decided which project this is, so
    // it says so outright rather than letting the popup resolve it again and
    // possibly differently. Silent disagreement here would open a session in
    // the wrong project and report success.
    const root = resolveProjectRoot(
      {
        HERDR_TAB_NEW_PROJECT: "/Users/andrew/src/compliance",
        HERDR_PLUGIN_CONTEXT_JSON: JSON.stringify({
          workspace_id: "wC",
          workspace_cwd: "/Users/andrew/src/herdr-tab-new",
        }),
      },
      "/Users/andrew/src/herdr-tab-new",
      deps({ gitRoot: "/Users/andrew/src/herdr-tab-new" }),
    );

    expect(root).toBe("/Users/andrew/src/compliance");
  });

  test("ignores an empty explicit project root", () => {
    const root = resolveProjectRoot(
      { HERDR_TAB_NEW_PROJECT: "" },
      "/Users/andrew/hrock/app",
      deps({ gitRoot: "/Users/andrew/hrock" }),
    );

    expect(root).toBe("/Users/andrew/hrock");
  });
});
