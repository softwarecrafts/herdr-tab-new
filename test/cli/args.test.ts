import { describe, expect, test } from "bun:test";
import { parseArgs } from "../../index.ts";

describe("parseArgs, plugin entry points", () => {
  test("recognises the action herdr invokes", () => {
    expect(parseArgs(["--plugin-action", "pick"]).pluginAction).toBe("pick");
  });

  test("recognises the popup pane herdr launches", () => {
    expect(parseArgs(["--plugin-pane", "pick"]).pluginPane).toBe("pick");
  });

  test("leaves both unset for an ordinary CLI run", () => {
    const args = parseArgs(["--dry-run"]);

    expect(args.pluginAction).toBeUndefined();
    expect(args.pluginPane).toBeUndefined();
  });

  test("rejects an entrypoint this binary does not implement", () => {
    // The manifest is the only caller, so an unknown name means the manifest
    // and the binary have drifted — a linked plugin built from a newer checkout
    // than the one running. Saying so beats silently doing nothing.
    expect(() => parseArgs(["--plugin-action", "teardown"])).toThrow(
      'unknown plugin entrypoint: "teardown"',
    );
  });

  test("refuses a bare --plugin-action with nothing after it", () => {
    expect(() => parseArgs(["--plugin-action"])).toThrow(
      "--plugin-action needs an entrypoint name",
    );
  });
});

describe("parseArgs, the existing surface", () => {
  test("still reads a tab name and the options around it", () => {
    const args = parseArgs(["beta", "--worktree", "--branch", "feat-auth"]);

    expect(args.name).toBe("beta");
    expect(args.worktree).toBe(true);
    expect(args.branch).toBe("feat-auth");
  });

  test("still rejects an unknown option", () => {
    expect(() => parseArgs(["--nope"])).toThrow("unknown option: --nope");
  });
});
