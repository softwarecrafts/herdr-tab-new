import { describe, expect, test } from "bun:test";
import {
  assertKnownKind,
  DEFAULT_KIND,
  FALLBACK_KINDS,
  parseAgentKinds,
  UnknownAgentKindError,
} from "../../src/agent/kinds.ts";

const help = await Bun.file(
  new URL("../fixtures/agent-start-help.txt", import.meta.url),
).text();

describe("parseAgentKinds", () => {
  test("reads the list out of herdr's own help", () => {
    // herdr's API schema types `kind` as a plain string, so its help text is the
    // only place the real list exists.
    const kinds = parseAgentKinds(help);

    expect(kinds).not.toBeNull();
    expect(kinds).toContain("claude");
    expect(kinds).toContain("codex");
    expect(kinds).toContain("gemini");
  });

  test("finds every kind, not just the first few", () => {
    expect(parseAgentKinds(help)!.length).toBeGreaterThan(15);
  });

  test("trims whitespace from each kind", () => {
    expect(parseAgentKinds(help)!.every((k) => k === k.trim())).toBe(true);
  });

  test("returns null when the help text has no list to read", () => {
    // The caller falls back to the baked-in list rather than failing.
    expect(parseAgentKinds("Usage: herdr agent start\n")).toBeNull();
  });

  test("returns null rather than an empty list for an empty list", () => {
    expect(parseAgentKinds("[possible values: ]")).toBeNull();
  });
});

describe("assertKnownKind", () => {
  const kinds = ["claude", "codex", "gemini"];

  test("accepts a supported kind", () => {
    expect(() => assertKnownKind("codex", kinds)).not.toThrow();
  });

  test("rejects an unsupported kind", () => {
    expect(() => assertKnownKind("nonsense", kinds)).toThrow(
      UnknownAgentKindError,
    );
  });

  test("names what is actually supported, so the message is actionable", () => {
    try {
      assertKnownKind("nonsense", kinds);
      throw new Error("expected assertKnownKind to throw");
    } catch (err) {
      expect((err as Error).message).toContain("claude");
      expect((err as Error).message).toContain("codex");
    }
  });

  test("is case-sensitive, matching herdr", () => {
    expect(() => assertKnownKind("Claude", kinds)).toThrow(
      UnknownAgentKindError,
    );
  });

  test("defaults to claude", () => {
    expect(DEFAULT_KIND).toBe("claude");
    expect(() => assertKnownKind(DEFAULT_KIND, FALLBACK_KINDS)).not.toThrow();
  });

  test("the fallback list covers the kinds herdr actually reports", () => {
    // If these drift apart the fallback is worse than useless — it would reject
    // a kind the installed herdr supports.
    for (const kind of parseAgentKinds(help)!) {
      expect(FALLBACK_KINDS).toContain(kind);
    }
  });
});
