import type { ExistingSession } from "../resolve/existing.ts";

/**
 * Choosing between sessions that already exist and starting a fresh one.
 *
 * Both halves are pure so the risky part can be tested exhaustively: a picker
 * that maps a keystroke onto the wrong session would attach you to somebody
 * else's work, which is worse than refusing to understand the input.
 */

export type Choice =
  | { kind: "existing"; index: number }
  | { kind: "new" }
  | { kind: "cancel" }
  | { kind: "invalid" };

export const NEW_KEY = "n";

/**
 * Note the strict number check rather than parseInt: `parseInt("1x")` is 1, so
 * a typo would silently select the first session.
 */
export function parseChoice(input: string, count: number): Choice {
  const trimmed = input.trim();

  if (trimmed === "") return { kind: "cancel" };
  if (trimmed.toLowerCase() === NEW_KEY) return { kind: "new" };
  if (!/^\d+$/.test(trimmed)) return { kind: "invalid" };

  const n = Number(trimmed);
  if (n < 1 || n > count) return { kind: "invalid" };

  return { kind: "existing", index: n - 1 };
}

/**
 * herdr has no timestamp for an agent, so this is only ever called with an age
 * that came from our own records. A session we did not create simply shows no
 * age rather than a guessed one.
 */
export function ago(createdIso: string, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - Date.parse(createdIso)) / 1000));

  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

export function formatPickerRows(
  sessions: ExistingSession[],
  nowMs: number,
): string[] {
  const rows = sessions.map((s, i) => {
    const parts = [s.status, s.label ?? s.paneId];
    if (s.created) parts.push(ago(s.created, nowMs));

    return `  ${i + 1}) ${parts.join("  ·  ")}`;
  });

  rows.push(`  ${NEW_KEY}) start a new session here`);

  return rows;
}

export type Outcome =
  | { kind: "focus"; session: ExistingSession }
  | { kind: "create" }
  | { kind: "cancel" }
  | { kind: "invalid" };

/**
 * A keystroke and the rows on screen, resolved to what should happen.
 *
 * parseChoice already turns input into an index; this is the step that turns an
 * index into a *session*, and it exists as its own function because two callers
 * now need it — the CLI prompt and the plugin's popup pane. Duplicating the
 * indexing in both is how "2" comes to mean different sessions in the two
 * places, which is the failure this module's header warns about.
 */
export function resolveChoice(
  input: string,
  sessions: ExistingSession[],
): Outcome {
  const choice = parseChoice(input, sessions.length);

  if (choice.kind === "existing") {
    return { kind: "focus", session: sessions[choice.index]! };
  }
  if (choice.kind === "new") return { kind: "create" };
  if (choice.kind === "cancel") return { kind: "cancel" };

  return { kind: "invalid" };
}
