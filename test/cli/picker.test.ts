import { describe, expect, test } from "bun:test";
import { formatPickerRows, parseChoice } from "../../src/cli/picker.ts";
import type { ExistingSession } from "../../src/resolve/existing.ts";

const NOW = Date.parse("2026-08-19T12:00:00.000Z");

const session = (over: Partial<ExistingSession> = {}): ExistingSession => ({
  paneId: "w2:p2",
  tabId: "w2:t2",
  workspaceId: "w2",
  projectRoot: "/Users/andrew/hrock/src/compliance",
  label: "compliance",
  status: "idle",
  created: "2026-08-19T10:00:00.000Z",
  terminalTitle: null,
  ...over,
});

describe("parseChoice — must never select the wrong session", () => {
  test("rejects a number with trailing characters", () => {
    // parseInt("1x") is 1. Accepting that would silently attach you to session
    // one because of a typo, which is the worst outcome available here.
    expect(parseChoice("1x", 3).kind).toBe("invalid");
  });

  test("rejects a number above the range rather than clamping", () => {
    expect(parseChoice("4", 3).kind).toBe("invalid");
  });

  test("rejects zero", () => {
    expect(parseChoice("0", 3).kind).toBe("invalid");
  });

  test("rejects a negative number", () => {
    expect(parseChoice("-1", 3).kind).toBe("invalid");
  });

  test("rejects words", () => {
    expect(parseChoice("banana", 3).kind).toBe("invalid");
  });
});

describe("parseChoice — the choices", () => {
  test("a number selects that session, counting from one", () => {
    expect(parseChoice("1", 3)).toEqual({ kind: "existing", index: 0 });
    expect(parseChoice("3", 3)).toEqual({ kind: "existing", index: 2 });
  });

  test("n asks for a new session", () => {
    expect(parseChoice("n", 3).kind).toBe("new");
  });

  test("N works too", () => {
    expect(parseChoice("N", 3).kind).toBe("new");
  });

  test("empty input cancels", () => {
    // Pressing enter should do nothing, not pick something.
    expect(parseChoice("", 3).kind).toBe("cancel");
  });

  test("whitespace is trimmed", () => {
    expect(parseChoice("  2  ", 3)).toEqual({ kind: "existing", index: 1 });
  });

  test("new is still offered when nothing exists", () => {
    expect(parseChoice("n", 0).kind).toBe("new");
  });
});

describe("formatPickerRows", () => {
  test("numbers each session from one", () => {
    const rows = formatPickerRows([session()], NOW);

    expect(rows[0]).toContain("1)");
  });

  test("shows status, name and age", () => {
    const rows = formatPickerRows([session()], NOW);

    expect(rows[0]).toContain("idle");
    expect(rows[0]).toContain("compliance");
    expect(rows[0]).toContain("2h ago");
  });

  test("always offers a new session last", () => {
    const rows = formatPickerRows([session(), session({ paneId: "w2:p3" })], NOW);

    expect(rows.at(-1)).toContain("n)");
    expect(rows.at(-1)).toMatch(/new session/i);
  });

  test("falls back to the pane id when herdr has no label", () => {
    const rows = formatPickerRows([session({ label: null })], NOW);

    expect(rows[0]).toContain("w2:p2");
  });

  test("says nothing about age for a session we did not create", () => {
    // herdr exposes no timestamp for an agent, so inventing one would be a lie.
    const rows = formatPickerRows([session({ created: null })], NOW);

    expect(rows[0]).not.toMatch(/ago/);
    expect(rows[0]).toContain("compliance");
  });

  test("reads minutes for a recent session", () => {
    const rows = formatPickerRows(
      [session({ created: "2026-08-19T11:45:00.000Z" })],
      NOW,
    );

    expect(rows[0]).toContain("15m ago");
  });

  test("reads days for an old one", () => {
    const rows = formatPickerRows(
      [session({ created: "2026-08-16T12:00:00.000Z" })],
      NOW,
    );

    expect(rows[0]).toContain("3d ago");
  });

  test("says just now for something seconds old", () => {
    const rows = formatPickerRows(
      [session({ created: "2026-08-19T11:59:50.000Z" })],
      NOW,
    );

    expect(rows[0]).toContain("just now");
  });

  test("marks a working agent, since that is the strongest signal available", () => {
    const rows = formatPickerRows([session({ status: "working" })], NOW);

    expect(rows[0]).toContain("working");
  });
});
