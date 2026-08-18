import { describe, expect, test } from "bun:test";
import { formatList } from "../../src/cli/output.ts";
import type { AnnotatedRecord } from "../../src/state/record.ts";

const row = (over: Partial<AnnotatedRecord> = {}): AnnotatedRecord => ({
  session: "default",
  workspaceId: "w2",
  workspaceLabel: "compliance",
  tabId: "w2:t2",
  label: "compliance",
  directory: "/Users/andrew/hrock/src/compliance",
  agentKind: "claude",
  agentStarted: true,
  worktree: null,
  created: "2026-08-18T20:00:00.000Z",
  live: true,
  ...over,
});

describe("formatList", () => {
  test("says so plainly when nothing has been recorded", () => {
    const out = formatList([], "default");

    expect(out).toContain("No tabs");
    expect(out).toContain("default");
  });

  test("lists newest first", () => {
    // The one you just made is the one you are looking for.
    const out = formatList(
      [
        row({ label: "older", created: "2026-08-18T09:00:00.000Z" }),
        row({ label: "newer", created: "2026-08-18T21:00:00.000Z" }),
      ],
      "default",
    );

    expect(out.indexOf("newer")).toBeLessThan(out.indexOf("older"));
  });

  test("marks a tab that still exists as live", () => {
    expect(formatList([row()], "default")).toContain("live");
  });

  test("marks a tab that has gone", () => {
    // These are what milestone 5's teardown will reconcile.
    expect(formatList([row({ live: false })], "default")).toContain("gone");
  });

  test("shows the tab id, kind and directory", () => {
    const out = formatList([row()], "default");

    expect(out).toContain("w2:t2");
    expect(out).toContain("claude");
    expect(out).toContain("/Users/andrew/hrock/src/compliance");
  });

  test("flags a tab whose agent never started", () => {
    const out = formatList([row({ agentStarted: false })], "default");

    expect(out).toContain("no agent");
  });

  test("does not flag a healthy tab as agentless", () => {
    expect(formatList([row()], "default")).not.toContain("no agent");
  });

  test("counts what it is showing", () => {
    const out = formatList(
      [row(), row({ tabId: "w2:t3", live: false })],
      "default",
    );

    expect(out).toContain("1 live");
    expect(out).toContain("1 gone");
  });

  test("names the session, so two sessions are never confused", () => {
    expect(formatList([row({ session: "hamilton" })], "hamilton")).toContain(
      "hamilton",
    );
  });
});
