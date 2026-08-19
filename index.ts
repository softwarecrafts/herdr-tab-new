#!/usr/bin/env bun
import { HerdrError } from "./src/herdr/client.ts";
import { resolveProjectRoot } from "./src/resolve/project-root.ts";
import { resolveSocket } from "./src/resolve/socket.ts";
import {
  AmbiguousWorkspaceError,
  chooseWorkspace,
  matchWorkspaces,
  NoWorkspaceMatchError,
  UnknownWorkspaceError,
} from "./src/resolve/workspace.ts";
import { generateLabel } from "./src/resolve/label.ts";
import { toAgentName } from "./src/agent/name.ts";
import { shouldAttach } from "./src/cli/attach.ts";
import {
  assertKnownKind,
  DEFAULT_KIND,
  UnknownAgentKindError,
} from "./src/agent/kinds.ts";
import { annotateLiveness, type TabRecord } from "./src/state/record.ts";
import {
  planTeardown,
  type SkippedRecord,
} from "./src/state/teardown.ts";
import { assertGitRepo, NotAGitRepoError } from "./src/resolve/git.ts";
import { isBranchInUse, worktreeIdentity } from "./src/herdr/worktree.ts";
import { layoutStatusFor, parseLayouts } from "./src/spreader/layout.ts";
import {
  formatAgentFailed,
  formatAmbiguous,
  formatCreated,
  formatList,
  formatNoMatch,
  formatPlan,
  formatTeardownPlan,
  formatTeardownResult,
  formatWorktreeCreated,
  type CreatedSummary,
  type ResolvedPlan,
} from "./src/cli/output.ts";
import {
  agentKinds,
  appendRecord,
  attachToPane,
  closeTab,
  createTab,
  createWorktree,
  gitBranch,
  gitToplevel,
  home,
  isDirectory,
  listAgentNames,
  listAllTabs,
  listPanes,
  listSessions,
  listTabs,
  listWorkspaces,
  readLayoutFiles,
  isWorktreeDirty,
  openWorktree,
  readRecords,
  removeWorktree,
  runSpread,
  spreadAvailable,
  startAgent,
  writeRecords,
} from "./src/system.ts";

export const EXIT = {
  ok: 0,
  usage: 1,
  herdrUnavailable: 2,
  noWorkspace: 3,
  ambiguous: 4,
} as const;

const USAGE = `herdr-tab-new — open a new agent session in the herdr workspace for this project

Usage:
  herdr-tab-new [name] [options]

Options:
  --dry-run              Show what would be created without creating it.
  --workspace <id|label> Use this workspace instead of inferring one.
  --kind <agent>         Agent to start (default: claude).
  -w, --worktree         Isolate the session in its own git worktree.
  --branch <name>        Branch for --worktree (default: the tab name).
  --list                 List the tabs this tool created in this session.
  --teardown [name]      Close sessions this tool created (all, or just [name]).
                         Combine with --dry-run to preview.
  -h, --help             Show this help.

If no live workspace matches the project, the matching herdr-spreader layout is
applied with \`spread\` and resolution is retried.

Exit codes:
  0 ok   1 usage   2 herdr unavailable   3 no matching workspace   4 ambiguous`;

type Args = {
  help: boolean;
  dryRun: boolean;
  list: boolean;
  teardown: boolean;
  kind: string;
  worktree: boolean;
  branch?: string;
  workspace?: string;
  name?: string;
};

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    dryRun: false,
    list: false,
    teardown: false,
    kind: DEFAULT_KIND,
    worktree: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--teardown") args.teardown = true;
    else if (arg === "-w" || arg === "--worktree") args.worktree = true;
    else if (arg === "--branch") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--branch needs a branch name");
      }
      args.branch = value;
      i += 1;
    }
    else if (arg === "--kind") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--kind needs an agent name");
      }
      args.kind = value;
      i += 1;
    }
    else if (arg === "--workspace") {
      const value = argv[i + 1];
      if (!value || value.startsWith("-")) {
        throw new Error("--workspace needs a workspace id or label");
      }
      args.workspace = value;
      i += 1;
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else if (args.name === undefined) {
      args.name = arg;
    } else {
      throw new Error(`unexpected argument: ${arg}`);
    }
  }

  return args;
}

function layoutFor(projectRoot: string) {
  const files = readLayoutFiles();
  return layoutStatusFor(
    files === null ? null : parseLayouts(files, home()),
    projectRoot,
  );
}

function buildPlan(args: Args): ResolvedPlan {
  const { socketPath, sessionName } = resolveSocket(process.env, listSessions());

  const fromZed = process.env.ZED_WORKTREE_ROOT;
  const projectRoot = resolveProjectRoot(process.env, process.cwd(), {
    isDirectory,
    gitToplevel,
  });

  const rootSource: ResolvedPlan["rootSource"] =
    fromZed && isDirectory(fromZed)
      ? "zed"
      : gitToplevel(process.cwd())
        ? "git"
        : "cwd";

  const workspace = chooseWorkspace(
    matchWorkspaces(listPanes(socketPath), projectRoot),
    listWorkspaces(socketPath),
    args.workspace,
    projectRoot,
  );

  const branch = gitBranch(projectRoot);

  return {
    sessionName,
    socketPath,
    workspace,
    label: generateLabel({
      branch,
      projectRoot,
      existingLabels: listTabs(socketPath, workspace.workspace_id).map(
        (t) => t.label,
      ),
      requested: args.name,
    }),
    projectRoot,
    branch,
    rootSource,
    agentKind: args.kind,
  };
}

/**
 * Resolve, and if nothing matched, try once to build the workspace from its
 * layout before giving up. `spread` is idempotent, so the retry cannot end up
 * with two copies of a workspace.
 */
function resolveOrSpread(args: Args): ResolvedPlan {
  try {
    return buildPlan(args);
  } catch (err) {
    if (!(err instanceof NoWorkspaceMatchError) || args.dryRun) throw err;

    const layout = layoutFor(err.projectRoot);
    if (layout.kind !== "declared" || !spreadAvailable()) throw err;

    console.error(`No workspace open for this project — running: spread ${layout.file}`);
    runSpread(layout.file);

    try {
      return buildPlan(args);
    } catch (retryErr) {
      if (retryErr instanceof NoWorkspaceMatchError) {
        throw Object.assign(retryErr, { spreadAttempted: true });
      }
      throw retryErr;
    }
  }
}

/**
 * The only place records are removed, and the only code here that destroys
 * anything. It acts strictly from the records, so a tab this tool never created
 * cannot be touched however it is named.
 */
function teardown(args: Args): number {
  const { socketPath } = resolveSocket(process.env, listSessions());
  const records = readRecords(socketPath);
  const liveTabIds = listAllTabs(socketPath).map((t) => t.tab_id);

  // Only live worktrees are worth asking git about.
  const dirtyWorktrees = records
    .filter((r) => r.worktree !== null && liveTabIds.includes(r.tabId))
    .map((r) => r.worktree as string)
    .filter(isWorktreeDirty);

  const plan = planTeardown({
    records,
    liveTabIds,
    dirtyWorktrees,
    target: args.name,
  });

  if (args.dryRun) {
    console.log(formatTeardownPlan(plan));
    return EXIT.ok;
  }

  // One session failing must not abandon the rest, and a record is only
  // forgotten once the thing it describes is actually gone.
  const done: TabRecord[] = [];
  const failed: SkippedRecord[] = [];

  const attempt = (record: TabRecord, act: () => void) => {
    try {
      act();
      done.push(record);
    } catch (err) {
      failed.push({ record, reason: (err as Error).message });
    }
  };

  for (const r of plan.closeTabs) attempt(r, () => closeTab(socketPath, r.tabId));
  for (const r of plan.removeWorktrees) {
    // Not forced: we already checked for uncommitted work, and herdr refusing
    // is a second line of defence rather than something we have overridden.
    attempt(r, () => removeWorktree(socketPath, r.workspaceId));
  }

  const staleOnly = plan.prune.filter(
    (r) => !plan.closeTabs.includes(r) && !plan.removeWorktrees.includes(r),
  );
  const forget = new Set([...staleOnly, ...done]);
  writeRecords(
    socketPath,
    records.filter((r) => !forget.has(r)),
  );

  console.log(
    formatTeardownResult({
      ...plan,
      closeTabs: done.filter((r) => r.worktree === null),
      removeWorktrees: done.filter((r) => r.worktree !== null),
      skipped: [...plan.skipped, ...failed],
      prune: [...staleOnly, ...done],
    }),
  );
  return EXIT.ok;
}

function list(): number {
  const { socketPath, sessionName } = resolveSocket(process.env, listSessions());
  const liveTabIds = listAllTabs(socketPath).map((t) => t.tab_id);

  console.log(
    formatList(annotateLiveness(readRecords(socketPath), liveTabIds), sessionName),
  );
  return EXIT.ok;
}

type StartTarget = {
  socketPath: string;
  sessionName: string;
  workspaceId: string;
  workspaceLabel: string;
  tabId: string;
  paneId: string;
  label: string;
  directory: string;
  agentKind: string;
  worktree: string | null;
};

/**
 * Start the agent and record the tab — in that order, and always both.
 *
 * The record is written whatever the agent does: the tab is real either way and
 * was deliberately left open, so teardown has to know it exists. Keeping this in
 * one place is deliberate; with tab mode and worktree mode there would otherwise
 * be four call sites to keep in step, and the ones easiest to forget are the
 * failure paths — exactly the tabs most likely to need cleaning up.
 */
function startAndRecord(t: StartTarget): { started: boolean; reason: string } {
  let started = true;
  let reason = "";

  try {
    startAgent(t.socketPath, {
      // Not t.label: herdr allows `/`, uppercase and any length in a tab label
      // but not in an agent name, so the name is derived rather than reused.
      name: toAgentName(t.label, listAgentNames(t.socketPath)),
      kind: t.agentKind,
      paneId: t.paneId,
    });
  } catch (err) {
    started = false;
    reason = (err as Error).message;
  }

  appendRecord(t.socketPath, {
    session: t.sessionName,
    workspaceId: t.workspaceId,
    workspaceLabel: t.workspaceLabel,
    tabId: t.tabId,
    label: t.label,
    directory: t.directory,
    agentKind: t.agentKind,
    agentStarted: started,
    worktree: t.worktree,
    created: new Date().toISOString(),
  });

  return { started, reason };
}

function create(plan: ResolvedPlan): number {
  const { tab, rootPane } = createTab(plan.socketPath, {
    workspaceId: plan.workspace.workspace_id,
    cwd: plan.projectRoot,
    label: plan.label,
  });

  const summary: CreatedSummary = {
    label: plan.label,
    tabId: tab.tab_id,
    paneId: rootPane.pane_id,
    workspaceLabel: plan.workspace.label,
    workspaceId: plan.workspace.workspace_id,
    projectRoot: plan.projectRoot,
    agentKind: plan.agentKind,
  };

  const { started, reason } = startAndRecord({
    socketPath: plan.socketPath,
    sessionName: plan.sessionName,
    workspaceId: plan.workspace.workspace_id,
    workspaceLabel: plan.workspace.label,
    tabId: tab.tab_id,
    paneId: rootPane.pane_id,
    label: plan.label,
    directory: plan.projectRoot,
    agentKind: plan.agentKind,
    worktree: null,
  });

  if (!started) {
    // The tab is real and useful even without the agent, so it stays.
    console.error(formatAgentFailed({ ...summary, reason }));
    return EXIT.herdrUnavailable;
  }

  console.log(formatCreated(summary));

  if (shouldAttach({ env: process.env, mode: "create", agentStarted: true })) {
    // Does not return: this terminal becomes the session.
    attachToPane(plan.socketPath, rootPane.pane_id);
  }

  return EXIT.ok;
}

/**
 * Worktree mode. herdr creates the worktree, a workspace for it, a tab and a
 * pane in one call, so workspace resolution is skipped entirely — this works
 * even when nothing is open for the project.
 */
function createInWorktree(args: Args): number {
  const { socketPath, sessionName } = resolveSocket(process.env, listSessions());
  const projectRoot = resolveProjectRoot(process.env, process.cwd(), {
    isDirectory,
    gitToplevel,
  });

  // Before any herdr call: otherwise herdr builds a workspace and only then
  // discovers there is nothing to branch from.
  assertGitRepo(projectRoot, gitToplevel(projectRoot));

  const { branch, label } = worktreeIdentity({
    derivedLabel: generateLabel({
      branch: gitBranch(projectRoot),
      projectRoot,
      existingLabels: [],
      requested: args.name,
    }),
    requestedName: args.name,
    requestedBranch: args.branch,
  });

  let result;
  let reused = false;
  try {
    result = createWorktree(socketPath, { projectRoot, branch });
  } catch (err) {
    if (!isBranchInUse(err)) throw err;
    // An existing branch is meant to be reused, not refused.
    result = openWorktree(socketPath, { projectRoot, branch });
    reused = true;
  }

  // Already open means there is a live session in that pane. Starting a second
  // agent there is refused by herdr anyway; focusing it is what was wanted.
  if (result.alreadyOpen) {
    console.log(
      `Worktree for "${branch}" is already open — focused workspace ${result.workspace.label} (${result.workspace.workspace_id}).\n  ${result.worktreePath}`,
    );
    return EXIT.ok;
  }

  const { started, reason } = startAndRecord({
    socketPath,
    sessionName,
    workspaceId: result.workspace.workspace_id,
    workspaceLabel: result.workspace.label,
    tabId: result.tab.tab_id,
    paneId: result.rootPane.pane_id,
    label,
    directory: result.worktreePath,
    agentKind: args.kind,
    worktree: result.worktreePath,
  });

  if (!started) {
    console.error(
      formatAgentFailed({
        label,
        tabId: result.tab.tab_id,
        paneId: result.rootPane.pane_id,
        workspaceLabel: result.workspace.label,
        workspaceId: result.workspace.workspace_id,
        projectRoot: result.worktreePath,
        agentKind: args.kind,
        reason,
      }),
    );
    return EXIT.herdrUnavailable;
  }

  console.log(
    formatWorktreeCreated({
      branch,
      worktreePath: result.worktreePath,
      workspaceLabel: result.workspace.label,
      workspaceId: result.workspace.workspace_id,
      tabId: result.tab.tab_id,
      paneId: result.rootPane.pane_id,
      agentKind: args.kind,
      reused,
    }),
  );

  if (
    shouldAttach({
      env: process.env,
      mode: "create-worktree",
      agentStarted: true,
    })
  ) {
    attachToPane(socketPath, result.rootPane.pane_id);
  }

  return EXIT.ok;
}

export function main(argv: string[]): number {
  let args: Args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`${(err as Error).message}\n\n${USAGE}`);
    return EXIT.usage;
  }

  if (args.help) {
    console.log(USAGE);
    return EXIT.ok;
  }

  try {
    if (args.list) return list();
    if (args.teardown) return teardown(args);

    // Before anything is created: herdr only rejects a bad kind at agent start,
    // by which point a tab exists.
    assertKnownKind(args.kind, agentKinds());

    if (args.worktree) return createInWorktree(args);

    const plan = resolveOrSpread(args);

    if (args.dryRun) {
      console.log(formatPlan(plan));
      return EXIT.ok;
    }

    return create(plan);
  } catch (err) {
    if (err instanceof NoWorkspaceMatchError) {
      console.error(
        formatNoMatch(err.projectRoot, {
          layout: layoutFor(err.projectRoot),
          spreadAvailable: spreadAvailable(),
          spreadAttempted: (err as { spreadAttempted?: boolean })
            .spreadAttempted,
        }),
      );
      return EXIT.noWorkspace;
    }
    if (err instanceof AmbiguousWorkspaceError) {
      console.error(formatAmbiguous(err.projectRoot, err.candidates));
      return EXIT.ambiguous;
    }
    if (err instanceof NotAGitRepoError) {
      console.error((err as Error).message);
      return EXIT.usage;
    }
    if (err instanceof UnknownAgentKindError) {
      console.error((err as Error).message);
      return EXIT.usage;
    }
    if (err instanceof UnknownWorkspaceError) {
      console.error((err as Error).message);
      return EXIT.usage;
    }
    if (err instanceof HerdrError) {
      console.error(`herdr: ${err.message}`);
      return EXIT.herdrUnavailable;
    }
    console.error((err as Error).message);
    return EXIT.herdrUnavailable;
  }
}

if (import.meta.main) {
  process.exit(main(process.argv.slice(2)));
}
