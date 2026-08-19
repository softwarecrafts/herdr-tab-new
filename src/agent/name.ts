/**
 * Turning a tab label into a name herdr will accept for an agent.
 *
 * These are two different namespaces with different rules, and conflating them
 * was a real bug: herdr happily created a tab labelled
 * `compliance/e2e-capture-tests` and then refused the identical string as an
 * agent name. herdr's rule is:
 *
 *   "must start with a lowercase letter and contain only lowercase letters,
 *    digits, '-' or '_' (1-32 characters)"
 *
 * That is not a corner case here. Of the branches in these repos, most use a
 * `prefix/description` convention, so almost none of them are legal agent names
 * as written — and some also carry uppercase, or run well past 32 characters.
 *
 * The tab label stays verbatim: seeing the exact branch in the tab bar is
 * deliberate. Only the agent name is derived.
 */

export const AGENT_NAME_MAX = 32;
const FALLBACK = "agent";

function sanitize(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    // Must start with a letter, so drop anything before the first one.
    .replace(/^[^a-z]+/, "");
}

/** Trim to length without leaving a name that looks cut off mid-word. */
function clamp(name: string, max: number): string {
  return name.slice(0, max).replace(/[-_]+$/, "");
}

export function toAgentName(label: string, taken: string[] = []): string {
  const base = clamp(sanitize(label), AGENT_NAME_MAX) || FALLBACK;

  if (!taken.includes(base)) return base;

  // Truncation makes collisions likelier than they were, and herdr refuses a
  // duplicate agent name outright — so the counter has to fit inside the limit.
  for (let n = 2; n < 1000; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${clamp(base, AGENT_NAME_MAX - suffix.length)}${suffix}`;
    if (!taken.includes(candidate)) return candidate;
  }

  return base;
}
