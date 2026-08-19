import { describe, expect, test } from "bun:test";
import { attachArgs, shouldAttach } from "../../src/cli/attach.ts";

describe("shouldAttach", () => {
  test("attaches after a session is created outside herdr", () => {
    // The point of the feature: you run it in a Zed terminal and that terminal
    // becomes the new agent session.
    expect(shouldAttach({ env: {}, mode: "create", agentStarted: true })).toBe(
      true,
    );
  });

  test("does not attach when already inside herdr", () => {
    // herdr exports HERDR_ENV in every pane it spawns. You are already in
    // herdr and can switch tabs, so taking the terminal over would be rude.
    expect(
      shouldAttach({
        env: { HERDR_ENV: "1" },
        mode: "create",
        agentStarted: true,
      }),
    ).toBe(false);
  });

  test("does not attach when the agent never started", () => {
    // There would be nothing to attach to, and the tab was left open precisely
    // so it could be inspected.
    expect(shouldAttach({ env: {}, mode: "create", agentStarted: false })).toBe(
      false,
    );
  });

  test("does not attach on a dry run", () => {
    expect(shouldAttach({ env: {}, mode: "dry-run", agentStarted: true })).toBe(
      false,
    );
  });

  test("does not attach when listing", () => {
    expect(shouldAttach({ env: {}, mode: "list", agentStarted: false })).toBe(
      false,
    );
  });

  test("does not attach when tearing down", () => {
    expect(
      shouldAttach({ env: {}, mode: "teardown", agentStarted: false }),
    ).toBe(false);
  });

  test("an empty HERDR_ENV does not count as being inside herdr", () => {
    expect(
      shouldAttach({ env: { HERDR_ENV: "" }, mode: "create", agentStarted: true }),
    ).toBe(true);
  });

  test("attaches for a worktree session too", () => {
    expect(
      shouldAttach({ env: {}, mode: "create-worktree", agentStarted: true }),
    ).toBe(true);
  });
});

describe("attachArgs", () => {
  test("attaches to the pane herdr just gave us", () => {
    expect(attachArgs("w9:p7")).toEqual(["agent", "attach", "w9:p7"]);
  });

  test("does not take over by default", () => {
    // --takeover would pull the terminal away from the herdr client. Whether
    // it is needed at all is settled by trying it, not assumed.
    expect(attachArgs("w9:p7")).not.toContain("--takeover");
  });
});
