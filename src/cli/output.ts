import type { LayoutStatus } from "../spreader/layout.ts";
import type { Workspace } from "../herdr/types.ts";
import type { AnnotatedRecord } from "../state/record.ts";

/**
 * Everything milestone 1 resolved. This is the whole answer to "what would you
 * do if I let you?" — nothing here has touched herdr's state.
 */
export type ResolvedPlan = {
  /** The herdr session we talked to, e.g. "default" or "hamilton". */
  sessionName: string;
  /** The socket that session listens on. */
  socketPath: string;
  /** The workspace the new tab would be created in. */
  workspace: Workspace;
  /** The tab name we would use, already de-duplicated against existing tabs. */
  label: string;
  /** The directory the new tab would open in — the project root. */
  projectRoot: string;
  /** Current branch, or null on a detached HEAD / outside a repo. */
  branch: string | null;
  /** How the project root was determined: "zed", "git" or "cwd". */
  rootSource: "zed" | "git" | "cwd";
  /** The agent that milestone 2 will start. Always "claude" for now. */
  agentKind: string;
};

const ROOT_SOURCE_LABEL: Record<ResolvedPlan["rootSource"], string> = {
  zed: "from ZED_WORKTREE_ROOT",
  git: "from git",
  cwd: "from the working directory",
};

/**
 * Render the resolved plan for a human.
 *
 * The first line is the decision; the block beneath it is the reasoning, so
 * that when the tool picks the wrong workspace you can see *why* without
 * re-running anything. `rootSource` is the most valuable line — "from the
 * working directory" means both Zed and git came up empty, which is nearly
 * always the real problem.
 *
 * The socket path appears only for a named session. With one session running it
 * is noise; with two it is the difference between working and silently
 * targeting the wrong one.
 */
export function formatPlan(plan: ResolvedPlan): string {
  const { workspace: ws } = plan;
  const tabs = `${ws.tab_count} existing tab${ws.tab_count === 1 ? "" : "s"}`;

  const rows: [string, string][] = [
    ["project", `${plan.projectRoot}  (${ROOT_SOURCE_LABEL[plan.rootSource]})`],
    ["branch", plan.branch ?? "no branch (detached HEAD, or not a git repo)"],
    ["workspace", `${ws.label} (${ws.workspace_id}), ${tabs}`],
    ["session", plan.sessionName],
  ];

  if (plan.sessionName !== "default") {
    rows.push(["socket", plan.socketPath]);
  }

  const width = Math.max(...rows.map(([key]) => key.length));

  return [
    `New ${plan.agentKind} session → tab "${plan.label}" in workspace ${ws.label} (${ws.workspace_id})`,
    "",
    ...rows.map(([key, value]) => `  ${key.padEnd(width)}  ${value}`),
  ].join("\n");
}

export type NoMatchContext = {
  layout: LayoutStatus;
  /** Whether `spread` is on PATH — only relevant when a layout exists. */
  spreadAvailable: boolean;
  /** Whether we already ran `spread` and still found no workspace. */
  spreadAttempted?: boolean;
};

/**
 * Shown when no live workspace has a pane in this project.
 *
 * There are four genuinely different situations here and conflating them wastes
 * the reader's time: a layout exists and we could build it, a layout exists but
 * `spread` is missing, we tried and it did not work, or there is nothing to
 * build at all. Each gets its own next step.
 */
export function formatNoMatch(
  projectRoot: string,
  { layout, spreadAvailable, spreadAttempted }: NoMatchContext,
): string {
  const lines = [`No live herdr workspace has a pane in ${projectRoot}.`, ""];

  if (layout.kind === "declared" && spreadAttempted) {
    lines.push(
      `\`spread ${layout.file}\` ran, but a workspace for this project did not`,
      "appear afterwards. Check the layout, then try again:",
      `  spread -n ${layout.file}    # show the plan without building it`,
    );
  } else if (layout.kind === "declared" && !spreadAvailable) {
    lines.push(
      `herdr-spreader has a layout for this project ("${layout.file}"), but`,
      "`spread` is not on PATH, so it cannot be applied automatically. Run:",
      `  spread ${layout.file}`,
    );
  } else if (layout.kind === "declared") {
    lines.push(
      `herdr-spreader has a layout for this project ("${layout.file}"). Run:`,
      `  spread ${layout.file}`,
    );
  } else if (layout.kind === "absent") {
    lines.push(
      "There is no layout for this project either, so there is nothing to",
      "bring up. Open a herdr workspace here, or add a layout to:",
      "  ~/.herdr-spreader/",
    );
  } else {
    lines.push(
      "The layout directory (~/.herdr-spreader/) could not be read, so it is",
      "not known whether a layout exists for this project.",
    );
  }

  return lines.join("\n");
}

/**
 * Shown when several workspaces have a pane in this project and none is
 * focused. We refuse to guess: picking wrong means starting work in the wrong
 * workspace, which is worse than being asked.
 */
export function formatAmbiguous(
  projectRoot: string,
  candidates: Workspace[],
): string {
  const lines = [
    `${candidates.length} herdr workspaces have a pane in ${projectRoot},`,
    "and none of them is focused, so it is not clear which you mean:",
    "",
  ];

  for (const w of candidates) {
    lines.push(`  ${w.label}  (${w.workspace_id}, ${w.tab_count} tab(s))`);
  }

  lines.push(
    "",
    "Focus the one you want, or name it explicitly:",
    `  herdr-tab-new --workspace ${candidates[0]?.label ?? "<name>"}`,
  );

  return lines.join("\n");
}

export type CreatedSummary = {
  label: string;
  tabId: string;
  paneId: string;
  workspaceLabel: string;
  workspaceId: string;
  projectRoot: string;
  agentKind: string;
};

/** The success case: the agent is up and waiting for you. */
export function formatCreated(c: CreatedSummary): string {
  return [
    `Started ${c.agentKind} in tab "${c.label}" (${c.tabId}), workspace ${c.workspaceLabel} (${c.workspaceId})`,
    "",
    `  directory  ${c.projectRoot}`,
    `  pane       ${c.paneId}`,
  ].join("\n");
}

/**
 * The tab exists but the agent never came up.
 *
 * The tab is deliberately left open: it is a shell at the right directory, which
 * is still useful, and closing it could destroy something. herdr's own reason is
 * passed through rather than guessed at.
 */
export function formatAgentFailed(
  c: CreatedSummary & { reason: string },
): string {
  return [
    `Created tab "${c.label}" (${c.tabId}) in workspace ${c.workspaceLabel} (${c.workspaceId}),`,
    `but ${c.agentKind} did not start: ${c.reason}`,
    "",
    `The tab has been left open at a shell prompt in ${c.projectRoot}.`,
    `Start ${c.agentKind} there yourself, or look into it with:`,
    `  herdr agent explain ${c.paneId}`,
  ].join("\n");
}

/**
 * The record of what this tool has created in the current session.
 *
 * "gone" entries are kept visible rather than filtered out: they are precisely
 * what teardown will have to reconcile, and hiding them would make the listing
 * look tidier than the state actually is.
 */
export function formatList(
  rows: AnnotatedRecord[],
  sessionName: string,
): string {
  if (rows.length === 0) {
    return `No tabs recorded for session "${sessionName}".`;
  }

  const newestFirst = [...rows].sort((a, b) =>
    b.created.localeCompare(a.created),
  );

  const live = newestFirst.filter((r) => r.live).length;
  const labelWidth = Math.max(...newestFirst.map((r) => r.label.length));
  const kindWidth = Math.max(...newestFirst.map((r) => r.agentKind.length));

  const lines = [
    `${live} live, ${newestFirst.length - live} gone — session "${sessionName}"`,
    "",
  ];

  for (const r of newestFirst) {
    const note = r.agentStarted ? "" : "  (no agent)";
    lines.push(
      `  ${r.live ? "live" : "gone"}  ${r.label.padEnd(labelWidth)}  ` +
        `${r.tabId.padEnd(7)}  ${r.agentKind.padEnd(kindWidth)}  ${r.directory}${note}`,
    );
  }

  return lines.join("\n");
}
