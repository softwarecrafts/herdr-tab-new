import { describe, expect, test } from "bun:test";
import { generateLabel } from "../../src/resolve/label.ts";

describe("generateLabel", () => {
  test("names the tab after the current branch", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
    });

    expect(label).toBe("feat-auth");
  });

  test("falls back to the directory name on a detached HEAD", () => {
    const label = generateLabel({
      branch: null,
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
    });

    expect(label).toBe("compliance");
  });

  test("appends a counter when the name is taken", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock",
      existingLabels: ["feat-auth"],
    });

    expect(label).toBe("feat-auth-2");
  });

  test("keeps counting past the first collision", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock",
      existingLabels: ["feat-auth", "feat-auth-2", "feat-auth-3"],
    });

    expect(label).toBe("feat-auth-4");
  });

  test("leaves a free name alone", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock",
      existingLabels: ["something-else"],
    });

    expect(label).toBe("feat-auth");
  });

  test("an explicit name wins over the branch", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock",
      existingLabels: [],
      requested: "spike",
    });

    expect(label).toBe("spike");
  });

  test("an explicit name is still counted when it collides", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock",
      existingLabels: ["spike"],
      requested: "spike",
    });

    expect(label).toBe("spike-2");
  });

  test("falls back to the directory name when the branch is empty", () => {
    const label = generateLabel({
      branch: "",
      projectRoot: "/Users/andrew/hrock/src/hamilton_rock",
      existingLabels: [],
    });

    expect(label).toBe("hamilton_rock");
  });
});

describe("generateLabel on a default branch", () => {
  test("prefers the project name over 'main'", () => {
    // Most new work starts on the default branch, so naming the tab after it
    // gives every project a tab called "main" — which says nothing.
    const label = generateLabel({
      branch: "main",
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
    });

    expect(label).toBe("compliance");
  });

  test("prefers the project name over 'master'", () => {
    const label = generateLabel({
      branch: "master",
      projectRoot: "/Users/andrew/hrock/src/hamilton_rock",
      existingLabels: [],
    });

    expect(label).toBe("hamilton_rock");
  });

  test("still uses a real feature branch", () => {
    const label = generateLabel({
      branch: "feat-auth",
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
    });

    expect(label).toBe("feat-auth");
  });

  test("does not mistake a branch merely starting with 'main'", () => {
    const label = generateLabel({
      branch: "maintenance-window",
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
    });

    expect(label).toBe("maintenance-window");
  });

  test("an explicit name still wins on a default branch", () => {
    const label = generateLabel({
      branch: "main",
      projectRoot: "/Users/andrew/hrock/src/compliance",
      existingLabels: [],
      requested: "spike",
    });

    expect(label).toBe("spike");
  });
});

describe("generateLabel with slashes in the branch", () => {
  test("keeps a slashed branch name verbatim", () => {
    // Deliberate: the full branch is what git says, and matching it exactly
    // beats a tidier name that no longer corresponds to anything.
    const label = generateLabel({
      branch: "compliance/e2e-capture-tests",
      projectRoot: "/Users/andrew/hrock/src/hamilton_rock",
      existingLabels: [],
    });

    expect(label).toBe("compliance/e2e-capture-tests");
  });

  test("counts collisions on a slashed name too", () => {
    const label = generateLabel({
      branch: "compliance/e2e-capture-tests",
      projectRoot: "/Users/andrew/hrock/src/hamilton_rock",
      existingLabels: ["compliance/e2e-capture-tests"],
    });

    expect(label).toBe("compliance/e2e-capture-tests-2");
  });
});
