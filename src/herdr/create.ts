import { HerdrError } from "./client.ts";
import type { AgentInfo, Pane, Tab } from "./types.ts";

/**
 * Building the two mutating herdr calls, and reading their answers.
 *
 * Kept pure and separate from src/system.ts so the argument shapes — the part
 * that is easy to get subtly wrong and expensive to get wrong halfway through —
 * are testable without creating anything.
 */

/** herdr rejects a timeout that is not greater than 3000, or above 300000. */
export const AGENT_TIMEOUT_MIN_MS = 3001;
export const AGENT_TIMEOUT_MAX_MS = 300_000;
export const AGENT_TIMEOUT_DEFAULT_MS = 60_000;

export type TabCreateInput = {
  workspaceId: string;
  cwd: string;
  label: string;
};

export function tabCreateArgs({
  workspaceId,
  cwd,
  label,
}: TabCreateInput): string[] {
  return [
    "tab",
    "create",
    "--workspace",
    workspaceId,
    "--cwd",
    cwd,
    "--label",
    label,
    // herdr defaults focus to false. This tab is where you are about to work,
    // so land in it.
    "--focus",
  ];
}

export type AgentStartInput = {
  name: string;
  kind: string;
  paneId: string;
  timeoutMs?: number;
};

export function agentStartArgs({
  name,
  kind,
  paneId,
  timeoutMs = AGENT_TIMEOUT_DEFAULT_MS,
}: AgentStartInput): string[] {
  const timeout = Math.min(
    AGENT_TIMEOUT_MAX_MS,
    Math.max(AGENT_TIMEOUT_MIN_MS, timeoutMs),
  );

  // The agent name is positional and must come straight after `start`.
  return [
    "agent",
    "start",
    name,
    "--kind",
    kind,
    "--pane",
    paneId,
    "--timeout",
    String(timeout),
  ];
}

export type TabCreated = { tab: Tab; rootPane: Pane };

export function parseTabCreated(result: unknown): TabCreated {
  const r = result as { type?: string; tab?: Tab; root_pane?: Pane };

  if (r?.type !== "tab_created" || !r.tab) {
    throw new HerdrError(
      "unexpected_response",
      `expected herdr to confirm a created tab, got ${JSON.stringify(result).slice(0, 200)}`,
    );
  }

  if (!r.root_pane?.pane_id) {
    throw new HerdrError(
      "unexpected_response",
      "herdr created the tab but reported no pane to start an agent in",
    );
  }

  return { tab: r.tab, rootPane: r.root_pane };
}

export type AgentStarted = { agent: AgentInfo; argv: string[] };

export function parseAgentStarted(result: unknown): AgentStarted {
  const r = result as { type?: string; agent?: AgentInfo; argv?: string[] };

  if (r?.type !== "agent_started" || !r.agent) {
    throw new HerdrError(
      "unexpected_response",
      `expected herdr to confirm a started agent, got ${JSON.stringify(result).slice(0, 200)}`,
    );
  }

  return { agent: r.agent, argv: r.argv ?? [] };
}

/**
 * `tab create` hands back the pane before its shell has reached an interactive
 * prompt, so an immediate `agent start` can be rejected outright — herdr's
 * --timeout covers agent readiness *after* launch, not the shell appearing in
 * the first place. Observed live: the identical call succeeds a moment later.
 *
 * Matched on the message because herdr reuses a generic error code here. If the
 * wording ever changes we stop retrying and report the failure, which is the
 * safe direction: the tab still exists and the user is told.
 */
export function isShellNotReady(err: unknown): boolean {
  return (
    err instanceof HerdrError && /not an available shell/i.test(err.message)
  );
}
