import { describe, expect, test } from "bun:test";
import { formatAgentFailed, formatCreated } from "../../src/cli/output.ts";

const created = {
  label: "compliance",
  tabId: "w2:t2",
  paneId: "w2:p2",
  workspaceLabel: "compliance",
  workspaceId: "w2",
  projectRoot: "/Users/andrew/hrock/src/compliance",
  agentKind: "claude",
};

describe("formatCreated", () => {
  test("leads with the fact the agent is running", () => {
    const out = formatCreated(created);

    expect(out.split("\n")[0]).toBe(
      'Started claude in tab "compliance" (w2:t2), workspace compliance (w2)',
    );
  });

  test("names the directory the session is in", () => {
    expect(formatCreated(created)).toContain(
      "/Users/andrew/hrock/src/compliance",
    );
  });

  test("names the pane, which is what you need to inspect it", () => {
    expect(formatCreated(created)).toContain("w2:p2");
  });
});

describe("formatAgentFailed", () => {
  const failure = { ...created, reason: "timed out after 60000ms" };

  test("says plainly that the tab was made but the agent was not", () => {
    const out = formatAgentFailed(failure);

    expect(out).toContain("compliance");
    expect(out).toContain("did not start");
  });

  test("passes on herdr's reason rather than inventing one", () => {
    expect(formatAgentFailed(failure)).toContain("timed out after 60000ms");
  });

  test("makes clear the tab was deliberately left open", () => {
    // Closing it could destroy something, and a shell in the right directory is
    // still useful.
    const out = formatAgentFailed(failure);

    expect(out).toContain("left open");
  });

  test("tells you how to look into it", () => {
    expect(formatAgentFailed(failure)).toContain("herdr agent explain w2:p2");
  });
});
