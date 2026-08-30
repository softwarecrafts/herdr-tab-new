import { describe, expect, test } from "bun:test";
import { resolvePluginContext } from "../../src/plugin/context.ts";

const captured = await Bun.file(
  new URL("../fixtures/plugin-context.json", import.meta.url),
).text();

const envWith = (json: string, extra: Record<string, string> = {}) => ({
  HERDR_PLUGIN_CONTEXT_JSON: json,
  ...extra,
});

describe("resolvePluginContext", () => {
  test("reads the context herdr actually injects", () => {
    // Captured from a real `herdr plugin action invoke` on 0.8.2.
    const context = resolvePluginContext(envWith(captured));

    expect(context).toEqual({
      workspaceId: "wC",
      projectRoot: "/Users/andrew/src/herdr-tab-new",
      tabId: "wC:t1",
      paneId: "wC:p1",
    });
  });

  test("is null outside herdr, so the CLI path is left alone", () => {
    expect(resolvePluginContext({})).toBeNull();
  });

  test("prefers the worktree checkout over the workspace directory", () => {
    // checkout_path is the analogue of `git rev-parse --show-toplevel`: inside a
    // linked worktree it is the worktree's own path, which is the project you
    // are actually in. workspace_cwd can be the directory the workspace opened at.
    const context = resolvePluginContext(
      envWith(
        JSON.stringify({
          workspace_id: "wA",
          workspace_cwd: "/Users/andrew/src/compliance",
          worktree: {
            checkout_path: "/Users/andrew/.herdr/worktrees/compliance/feat-auth",
            repo_root: "/Users/andrew/src/compliance",
            is_linked_worktree: true,
          },
        }),
      ),
    );

    expect(context?.projectRoot).toBe(
      "/Users/andrew/.herdr/worktrees/compliance/feat-auth",
    );
  });

  test("falls back to workspace_cwd when the workspace is not a git repo", () => {
    const context = resolvePluginContext(
      envWith(
        JSON.stringify({ workspace_id: "wA", workspace_cwd: "/tmp/scratch" }),
      ),
    );

    expect(context?.projectRoot).toBe("/tmp/scratch");
  });

  test("survives malformed JSON rather than taking the process down", () => {
    // Same tolerance parseRecords applies to a truncated record: a broken
    // boundary value must degrade to the CLI path, never throw.
    expect(resolvePluginContext(envWith("{not json"))).toBeNull();
  });

  test("refuses a context with no directory in it at all", () => {
    expect(
      resolvePluginContext(envWith(JSON.stringify({ workspace_id: "wA" }))),
    ).toBeNull();
  });

  test("falls back to the individual env vars for ids herdr omitted", () => {
    const context = resolvePluginContext(
      envWith(JSON.stringify({ workspace_cwd: "/tmp/scratch" }), {
        HERDR_WORKSPACE_ID: "wB",
        HERDR_TAB_ID: "wB:t3",
        HERDR_PANE_ID: "wB:p3",
      }),
    );

    expect(context).toEqual({
      workspaceId: "wB",
      projectRoot: "/tmp/scratch",
      tabId: "wB:t3",
      paneId: "wB:p3",
    });
  });
});
