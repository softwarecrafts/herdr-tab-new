import { describe, expect, test } from "bun:test";
import { AGENT_NAME_MAX, toAgentName } from "../../src/agent/name.ts";

/** herdr: "must start with a lowercase letter and contain only lowercase letters, digits, '-' or '_' (1-32 characters)" */
const LEGAL = /^[a-z][a-z0-9_-]{0,31}$/;

describe("toAgentName — the reported failure", () => {
  test("turns a slashed branch into a legal agent name", () => {
    // The bug: `compliance/e2e-capture-tests` was passed straight through as the
    // agent name. The tab accepted it; the agent name did not.
    expect(toAgentName("compliance/e2e-capture-tests")).toBe(
      "compliance-e2e-capture-tests",
    );
  });

  test("the result is legal by herdr's own rule", () => {
    expect(toAgentName("compliance/e2e-capture-tests")).toMatch(LEGAL);
  });
});

describe("toAgentName — every way a real branch breaks the rule", () => {
  const realBranches = [
    "compliance/e2e-capture-tests",
    "andrew/eng-244-step-up-reauthentication-gate-15-min-freshness-on-sensitive",
    "claude/staff-flag-workflow-1K0VA",
    "feature/darkMode",
    "refactor/webhook-adapter-payment-complex",
    "nanorepublica/issue2",
    "worktree-fix-onboarding-external-account",
    "main",
  ];

  for (const branch of realBranches) {
    test(`produces a legal name for "${branch.slice(0, 40)}"`, () => {
      expect(toAgentName(branch)).toMatch(LEGAL);
    });
  }
});

describe("toAgentName — the rules individually", () => {
  test("lowercases", () => {
    expect(toAgentName("feature/darkMode")).toBe("feature-darkmode");
  });

  test("replaces anything illegal with a dash", () => {
    expect(toAgentName("a b.c/d")).toBe("a-b-c-d");
  });

  test("keeps digits, dashes and underscores", () => {
    expect(toAgentName("eng-119_v2")).toBe("eng-119_v2");
  });

  test("truncates to herdr's limit", () => {
    const long =
      "andrew/eng-244-step-up-reauthentication-gate-15-min-freshness-on-sensitive";

    expect(toAgentName(long).length).toBeLessThanOrEqual(AGENT_NAME_MAX);
  });

  test("does not leave a trailing dash after truncating", () => {
    // Legal either way, but a name ending in "-" reads like it was cut off.
    const name = toAgentName(`feature/${"a".repeat(20)}-${"b".repeat(20)}`);

    expect(name.endsWith("-")).toBe(false);
  });

  test("must start with a letter, so leading digits are dropped", () => {
    expect(toAgentName("2024-planning")).toBe("planning");
  });

  test("drops a leading dash", () => {
    expect(toAgentName("-wip")).toBe("wip");
  });

  test("leaves an already-legal name alone", () => {
    expect(toAgentName("main")).toBe("main");
  });

  test("falls back to something legal when nothing survives", () => {
    expect(toAgentName("///")).toMatch(LEGAL);
  });

  test("falls back for an empty label", () => {
    expect(toAgentName("")).toMatch(LEGAL);
  });
});

describe("toAgentName — uniqueness", () => {
  test("avoids a name already in use", () => {
    // herdr refuses a duplicate agent name outright, and truncation makes
    // collisions more likely than they were before.
    expect(toAgentName("compliance", ["compliance"])).toBe("compliance-2");
  });

  test("keeps counting past the first collision", () => {
    expect(
      toAgentName("compliance", ["compliance", "compliance-2"]),
    ).toBe("compliance-3");
  });

  test("stays within the limit when adding a counter", () => {
    const long = "a".repeat(40);
    const taken = [toAgentName(long)];

    const name = toAgentName(long, taken);
    expect(name.length).toBeLessThanOrEqual(AGENT_NAME_MAX);
    expect(name).toMatch(LEGAL);
    expect(name).not.toBe(taken[0]);
  });

  test("leaves a free name alone", () => {
    expect(toAgentName("compliance", ["something-else"])).toBe("compliance");
  });
});
