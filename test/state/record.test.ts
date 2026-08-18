import { describe, expect, test } from "bun:test";
import {
  annotateLiveness,
  parseRecords,
  stateFileFor,
  type TabRecord,
  toRecordLine,
} from "../../src/state/record.ts";

const record = (over: Partial<TabRecord> = {}): TabRecord => ({
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
  ...over,
});

describe("stateFileFor", () => {
  test("puts state beside the default session, like other herdr tools do", () => {
    expect(stateFileFor("/Users/andrew/.config/herdr/herdr.sock")).toBe(
      "/Users/andrew/.config/herdr/herdr-tab-new/tabs.jsonl",
    );
  });

  test("keeps a named session's records separate", () => {
    // Otherwise the hamilton session's tabs would show up in the default
    // session's listing, and teardown would target the wrong herdr.
    expect(
      stateFileFor(
        "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
      ),
    ).toBe(
      "/Users/andrew/.config/herdr/sessions/hamilton/herdr-tab-new/tabs.jsonl",
    );
  });

  test("works for a socket that belongs to no known session", () => {
    expect(stateFileFor("/tmp/adhoc/herdr.sock")).toBe(
      "/tmp/adhoc/herdr-tab-new/tabs.jsonl",
    );
  });
});

describe("toRecordLine", () => {
  test("writes exactly one line, so appends can interleave safely", () => {
    const line = toRecordLine(record());

    expect(line.endsWith("\n")).toBe(true);
    expect(line.trimEnd().includes("\n")).toBe(false);
  });

  test("survives a round trip", () => {
    expect(parseRecords(toRecordLine(record()))[0]).toEqual(record());
  });

  test("keeps a label containing a slash intact", () => {
    const r = record({ label: "compliance/e2e-capture-tests" });

    expect(parseRecords(toRecordLine(r))[0]?.label).toBe(
      "compliance/e2e-capture-tests",
    );
  });
});

describe("parseRecords", () => {
  test("reads several appended records", () => {
    const text =
      toRecordLine(record({ tabId: "w2:t2" })) +
      toRecordLine(record({ tabId: "w2:t3" }));

    expect(parseRecords(text).map((r) => r.tabId)).toEqual(["w2:t2", "w2:t3"]);
  });

  test("skips a corrupt line rather than losing the whole file", () => {
    // A half-written line from a killed process must not cost you the records
    // either side of it.
    const text =
      toRecordLine(record({ tabId: "w2:t2" })) +
      '{"session":"default","tabId":\n' +
      toRecordLine(record({ tabId: "w2:t4" }));

    expect(parseRecords(text).map((r) => r.tabId)).toEqual(["w2:t2", "w2:t4"]);
  });

  test("ignores blank lines", () => {
    expect(parseRecords(`\n\n${toRecordLine(record())}\n\n`)).toHaveLength(1);
  });

  test("skips valid JSON that is not a record", () => {
    expect(parseRecords('{"hello":"world"}\n')).toHaveLength(0);
  });

  test("returns nothing for an empty file", () => {
    expect(parseRecords("")).toEqual([]);
  });
});

describe("annotateLiveness", () => {
  test("marks a record whose tab still exists as live", () => {
    const [row] = annotateLiveness([record({ tabId: "w2:t2" })], ["w2:t2"]);

    expect(row?.live).toBe(true);
  });

  test("marks a record whose tab has gone", () => {
    // These are exactly what teardown will later have to reconcile.
    const [row] = annotateLiveness([record({ tabId: "w2:t9" })], ["w2:t2"]);

    expect(row?.live).toBe(false);
  });

  test("treats an empty herdr as everything being gone", () => {
    const rows = annotateLiveness([record(), record({ tabId: "w2:t3" })], []);

    expect(rows.every((r) => !r.live)).toBe(true);
  });
});

describe("stateFileFor with an override", () => {
  test("an explicit path wins over the session-derived one", () => {
    // Lets the live check write somewhere disposable instead of polluting the
    // real session's records on every run.
    expect(
      stateFileFor("/Users/andrew/.config/herdr/herdr.sock", "/tmp/probe.jsonl"),
    ).toBe("/tmp/probe.jsonl");
  });

  test("an empty override is ignored", () => {
    expect(stateFileFor("/Users/andrew/.config/herdr/herdr.sock", "")).toBe(
      "/Users/andrew/.config/herdr/herdr-tab-new/tabs.jsonl",
    );
  });
});
