import { describe, expect, test } from "bun:test";
import { attachArgs, shouldAttach, titleEscape } from "../../src/cli/attach.ts";

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
    expect(attachArgs("w9:p7").slice(0, 3)).toEqual(["agent", "attach", "w9:p7"]);
  });

  test("takes over input", () => {
    // Settled by trying it. Without --takeover the attach connects but does not
    // own input: nothing typed reaches the agent. herdr's docs describe the
    // flag as how you claim input when something else holds it, and that is
    // exactly the state attaching from Zed lands in.
    expect(attachArgs("w9:p7")).toContain("--takeover");
  });
});

describe("titleEscape", () => {
  test("emits an OSC 2 window-title sequence", () => {
    // Without this, Zed names the terminal tab after the foreground process —
    // "herdr-tab-new" — which says nothing about the session.
    expect(titleEscape("feat-auth")).toBe("\x1b]2;feat-auth\x07");
  });

  test("carries the session label", () => {
    expect(titleEscape("compliance/e2e-capture-tests")).toContain(
      "compliance/e2e-capture-tests",
    );
  });

  test("strips control characters that would break the sequence", () => {
    // A stray BEL or ESC in a label would terminate the escape early and spill
    // the rest onto the screen.
    expect(titleEscape("bad\x07label\x1bhere")).toBe("\x1b]2;badlabelhere\x07");
  });

  test("produces nothing for an empty label", () => {
    // Better to leave the terminal's own title alone than blank it.
    expect(titleEscape("")).toBe("");
  });
});
