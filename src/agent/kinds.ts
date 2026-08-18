/**
 * Which agents can herdr start?
 *
 * herdr's API schema types `kind` as a plain string, so the only authoritative
 * list is the `[possible values: ...]` line in `herdr agent start --help`.
 * Reading it at runtime means a herdr upgrade that adds an agent works
 * immediately, and the error message names what *this* herdr supports.
 *
 * This matters more than it looks: herdr only rejects a bad kind at
 * `agent start`, which happens after the tab has been created. Validating up
 * front is the difference between a clear error and a stray tab per typo.
 */

export const DEFAULT_KIND = "claude";

/** Used only if herdr's help ever stops being parseable. Kept in step with 0.8.0. */
export const FALLBACK_KINDS = [
  "pi",
  "claude",
  "codex",
  "gemini",
  "cursor",
  "devin",
  "agy",
  "cline",
  "omp",
  "mastracode",
  "opencode",
  "copilot",
  "kimi",
  "kiro",
  "droid",
  "amp",
  "grok",
  "hermes",
  "kilo",
  "qodercli",
  "maki",
];

export class UnknownAgentKindError extends Error {
  constructor(
    readonly requested: string,
    readonly supported: string[],
  ) {
    super(
      `unsupported agent kind "${requested}"\nsupported: ${supported.join(", ")}`,
    );
    this.name = "UnknownAgentKindError";
  }
}

export function parseAgentKinds(helpText: string): string[] | null {
  const match = /\[possible values:([^\]]*)\]/.exec(helpText);
  if (!match) return null;

  const kinds = match[1]!
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);

  return kinds.length > 0 ? kinds : null;
}

export function assertKnownKind(kind: string, supported: string[]): void {
  if (!supported.includes(kind)) {
    throw new UnknownAgentKindError(kind, supported);
  }
}
