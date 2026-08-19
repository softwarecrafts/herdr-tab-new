import { resolve } from "node:path";
import type { AgentInfo, Tab } from "../herdr/types.ts";
import type { TabRecord } from "../state/record.ts";

/**
 * Sessions that already exist, so running the command again resumes rather than
 * duplicates.
 *
 * Close the terminal you were attached from and the tab and its agent survive
 * in the herdr server — correctly, but invisibly. Without this, the next run in
 * the same project silently makes a second session, and the work you meant to
 * pick back up becomes the hardest thing to find.
 *
 * A session is built by joining three sources on `tab_id`:
 *
 *   herdr's agents  — status and pane; the live truth, and the only source that
 *                     knows about sessions this tool never created
 *   herdr's tabs    — the name, taken from here rather than from our record,
 *                     because a record goes stale if the tab is renamed
 *   our records     — the age, which herdr does not expose for an agent at all
 *
 * Two things herdr cannot tell us, which is why they are absent here: whether a
 * client is attached to a pane, and when an agent started.
 */

export type ExistingSession = {
  paneId: string;
  tabId: string;
  workspaceId: string;
  projectRoot: string;
  /** herdr's tab label, or null when no tab entry matched. */
  label: string | null;
  /** "working" | "idle" | … — the closest thing to a liveness signal. */
  status: string;
  /** ISO timestamp from our record, or null for a session we did not create. */
  created: string | null;
  /** Often what the agent is currently doing. */
  terminalTitle: string | null;
};

export type SessionSources = {
  agents: AgentInfo[];
  tabs: Tab[];
  records: TabRecord[];
};

function toSession(
  agent: AgentInfo,
  { tabs, records }: SessionSources,
): ExistingSession {
  const tab = tabs.find((t) => t.tab_id === agent.tab_id);
  const record = records.find((r) => r.tabId === agent.tab_id);

  return {
    paneId: agent.pane_id,
    tabId: agent.tab_id,
    workspaceId: agent.workspace_id,
    projectRoot: agent.cwd,
    label: tab?.label ?? null,
    status: agent.agent_status,
    created: record?.created ?? null,
    terminalTitle: agent.terminal_title_stripped ?? null,
  };
}

export function matchExistingSessions(
  sources: SessionSources & { projectRoot: string },
): ExistingSession[] {
  const target = resolve(sources.projectRoot);

  return sources.agents
    .filter((a) => a.cwd && resolve(a.cwd) === target)
    .map((a) => toSession(a, sources));
}

export type ProjectGroup = {
  projectRoot: string;
  sessions: ExistingSession[];
};

/** For `--attach`: everything live, so the accumulation is finally visible. */
export function groupByProject(sources: SessionSources): ProjectGroup[] {
  const groups = new Map<string, ExistingSession[]>();

  for (const agent of sources.agents) {
    if (!agent.cwd) continue;
    const session = toSession(agent, sources);
    const existing = groups.get(agent.cwd);
    if (existing) existing.push(session);
    else groups.set(agent.cwd, [session]);
  }

  return [...groups.entries()]
    .map(([projectRoot, sessions]) => ({ projectRoot, sessions }))
    .sort((a, b) => b.sessions.length - a.sessions.length);
}
