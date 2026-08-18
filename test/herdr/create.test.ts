import { describe, expect, test } from "bun:test";
import {
  agentStartArgs,
  AGENT_TIMEOUT_MAX_MS,
  AGENT_TIMEOUT_MIN_MS,
  parseAgentStarted,
  parseTabCreated,
  tabCreateArgs,
} from "../../src/herdr/create.ts";
import { HerdrError } from "../../src/herdr/client.ts";

describe("tabCreateArgs", () => {
  const args = tabCreateArgs({
    workspaceId: "w2",
    cwd: "/Users/andrew/hrock/src/compliance",
    label: "compliance",
  });

  test("targets the resolved workspace", () => {
    expect(args).toContain("--workspace");
    expect(args[args.indexOf("--workspace") + 1]).toBe("w2");
  });

  test("opens the tab in the project directory", () => {
    expect(args[args.indexOf("--cwd") + 1]).toBe(
      "/Users/andrew/hrock/src/compliance",
    );
  });

  test("carries the resolved label", () => {
    expect(args[args.indexOf("--label") + 1]).toBe("compliance");
  });

  test("always focuses the new tab", () => {
    // This is for you to start work in, so land in it. herdr defaults focus to
    // false, which is the wrong default here.
    expect(args).toContain("--focus");
  });

  test("keeps a label with a slash intact as one argument", () => {
    const slashed = tabCreateArgs({
      workspaceId: "w8",
      cwd: "/Users/andrew/hrock/src/hamilton_rock",
      label: "compliance/e2e-capture-tests",
    });

    expect(slashed[slashed.indexOf("--label") + 1]).toBe(
      "compliance/e2e-capture-tests",
    );
  });
});

describe("agentStartArgs", () => {
  const args = agentStartArgs({
    name: "compliance",
    kind: "claude",
    paneId: "w2:p2",
    timeoutMs: 60000,
  });

  test("passes the agent name as the positional argument", () => {
    expect(args.slice(0, 3)).toEqual(["agent", "start", "compliance"]);
  });

  test("names the agent kind and the pane it starts in", () => {
    expect(args[args.indexOf("--kind") + 1]).toBe("claude");
    expect(args[args.indexOf("--pane") + 1]).toBe("w2:p2");
  });

  test("sets an explicit readiness timeout", () => {
    expect(args[args.indexOf("--timeout") + 1]).toBe("60000");
  });

  test("raises a timeout below herdr's floor", () => {
    // herdr rejects anything not greater than 3000; sending it would fail the
    // whole call after the tab had already been created.
    const low = agentStartArgs({
      name: "x",
      kind: "claude",
      paneId: "w2:p2",
      timeoutMs: 500,
    });

    expect(low[low.indexOf("--timeout") + 1]).toBe(String(AGENT_TIMEOUT_MIN_MS));
  });

  test("caps a timeout above herdr's ceiling", () => {
    const high = agentStartArgs({
      name: "x",
      kind: "claude",
      paneId: "w2:p2",
      timeoutMs: 999_999,
    });

    expect(high[high.indexOf("--timeout") + 1]).toBe(
      String(AGENT_TIMEOUT_MAX_MS),
    );
  });
});

describe("parseTabCreated", () => {
  const result = {
    type: "tab_created",
    tab: { tab_id: "w2:t2", workspace_id: "w2", label: "compliance" },
    root_pane: { pane_id: "w2:p2", tab_id: "w2:t2", workspace_id: "w2" },
  };

  test("hands back the new tab and its pane", () => {
    // herdr returns the pane on creation, so there is nothing to poll for.
    const created = parseTabCreated(result);

    expect(created.tab.tab_id).toBe("w2:t2");
    expect(created.rootPane.pane_id).toBe("w2:p2");
  });

  test("refuses a response of the wrong type", () => {
    expect(() => parseTabCreated({ type: "workspace_list" })).toThrow(
      HerdrError,
    );
  });

  test("refuses a response with no pane to start an agent in", () => {
    expect(() => parseTabCreated({ type: "tab_created", tab: result.tab })).toThrow(
      HerdrError,
    );
  });
});

describe("parseAgentStarted", () => {
  test("confirms which agent herdr started", () => {
    const started = parseAgentStarted({
      type: "agent_started",
      agent: { agent: "claude", pane_id: "w2:p2", agent_status: "idle" },
      argv: ["claude"],
    });

    expect(started.agent.pane_id).toBe("w2:p2");
  });

  test("refuses a response of the wrong type", () => {
    expect(() => parseAgentStarted({ type: "tab_created" })).toThrow(HerdrError);
  });
});
