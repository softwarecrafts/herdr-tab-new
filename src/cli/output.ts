import type { LayoutStatus } from "../spreader/layout.ts";
import type { Workspace } from "../herdr/types.ts";

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

/**
 * Shown when no live workspace has a pane in this project. The layout status
 * tells the reader which situation they are in: spreader can build this
 * workspace for them (milestone 2 will), or nothing can and they need to open
 * the workspace themselves.
 */
export function formatNoMatch(
  projectRoot: string,
  layout: LayoutStatus,
): string {
  const lines = [
    `No live herdr workspace has a pane in ${projectRoot}.`,
    "",
  ];

  if (layout.kind === "declared") {
    lines.push(
      `herdr-spreader declares a layout for this project ("${layout.name}").`,
      "Milestone 2 will bring that workspace up automatically. For now, run:",
      "  herdr-spreader apply",
    );
  } else if (layout.kind === "absent") {
    lines.push(
      "herdr-spreader has no layout for this project either, so there is",
      "nothing to bring up. Open a herdr workspace here, or add a layout to:",
      "  ~/.config/herdr/plugins/config/herdr-spreader/config.yaml",
    );
  } else {
    lines.push(
      "herdr-spreader's config could not be read, so it is not known whether",
      "a layout exists for this project.",
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
