import { dirname, join } from "node:path";

/**
 * What the helper remembers about the tabs it created.
 *
 * Stored as JSONL — one record per line, appended. Two runs at once can both
 * append safely because a single short write with O_APPEND is atomic; a
 * whole-file JSON array rewritten each time would lose one of them. It also
 * means a half-written line from a killed process costs exactly that line,
 * rather than the whole file.
 *
 * Records live beside the herdr session they describe, following the convention
 * zed-herdr set (its own directory inside the session directory), so the default
 * and `hamilton` sessions never share state.
 */

export const STATE_DIR = "herdr-tab-new";
export const STATE_FILE = "tabs.jsonl";

export type TabRecord = {
  session: string;
  workspaceId: string;
  workspaceLabel: string;
  tabId: string;
  label: string;
  directory: string;
  agentKind: string;
  /** False when the tab was created but the agent never came up. */
  agentStarted: boolean;
  /** Always null until milestone 4 adds worktrees. */
  worktree: string | null;
  created: string;
};

/**
 * The socket always sits in its session's directory, so its dirname is the
 * session directory — true for the default session, a named one, and an
 * explicitly-set socket that matches no session at all.
 *
 * `override` (HERDR_TAB_NEW_STATE) lets the live check write somewhere
 * disposable rather than adding a throwaway record to real state on every run.
 */
export function stateFileFor(socketPath: string, override?: string): string {
  if (override) return override;
  return join(dirname(socketPath), STATE_DIR, STATE_FILE);
}

export function toRecordLine(record: TabRecord): string {
  return `${JSON.stringify(record)}\n`;
}

const REQUIRED: (keyof TabRecord)[] = ["tabId", "label", "session", "directory"];

function isRecord(value: unknown): value is TabRecord {
  if (typeof value !== "object" || value === null) return false;
  return REQUIRED.every((key) => typeof (value as TabRecord)[key] === "string");
}

export function parseRecords(text: string): TabRecord[] {
  const records: TabRecord[] = [];

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      const parsed: unknown = JSON.parse(line);
      if (isRecord(parsed)) records.push(parsed);
    } catch {
      // A truncated line from a killed process. Skip it and keep the rest.
    }
  }

  return records;
}

export type AnnotatedRecord = TabRecord & { live: boolean };

export function annotateLiveness(
  records: TabRecord[],
  liveTabIds: string[],
): AnnotatedRecord[] {
  return records.map((r) => ({ ...r, live: liveTabIds.includes(r.tabId) }));
}
