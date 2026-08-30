#!/usr/bin/env bun
import { HerdrError } from "./src/herdr/client.ts";
import { resolveProjectRoot } from "./src/resolve/project-root.ts";
import { resolvePluginContext } from "./src/plugin/context.ts";
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
  groupByProject,
  matchExistingSessions,
  type ExistingSession,
} from "./src/resolve/existing.ts";
import {
  ago,
  formatPickerRows,
  parseChoice,
  resolveChoice,
} from "./src/cli/picker.ts";
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
  focusSession,
  closeTab,
  createTab,
  createWorktree,
  gitBranch,
  gitToplevel,
  home,
  isDirectory,
  isInteractive,
  listAgentNames,
  listAgents,
  listAllTabs,
  listPanes,
  listSessions,
  listTabs,
  listWorkspaces,
  readLayoutFiles,
  isWorktreeDirty,
  openPluginPane,
  openWorktree,
  promptChoice,
  promptOnStderr,
  say,
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
  needsChoice: 5,
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
  --new                  Always create, without offering existing sessions.
  --attach               Pick from every live agent session, across all projects.
  --teardown [name]      Close sessions this tool created (all, or just [name]).
                         Combine with --dry-run to preview.
  -h, --help             Show this help.

If no live workspace matches the project, the matching herdr-spreader layout is
applied with \`spread\` and resolution is retried.

Exit codes:
  0 ok   1 usage   2 herdr unavailable   3 no matching workspace   4 ambiguous
  5 a choice is needed but this is not a terminal`;

type Args = {
  help: boolean;
  dryRun: boolean;
  list: boolean;
  teardown: boolean;
  fresh: boolean;
  attach: boolean;
  kind: string;
  worktree: boolean;
  branch?: string;
  workspace?: string;
  name?: string;
  /** Set only when herdr invoked us as a plugin action. */
  pluginAction?: PluginEntrypoint;
  /** Set only when herdr launched us as a plugin pane. */
  pluginPane?: PluginEntrypoint;
};

/**
 * The entry points herdr-plugin.toml is allowed to name.
 *
 * Only "pick" for now — it subsumes starting a new session, because the picker
 * already offers that as a row. Worktree mode, teardown and --list stay on the
 * CLI, where they have flags and a scrollback to print into.
 */
const PLUGIN_ENTRYPOINTS = ["pick"] as const;
type PluginEntrypoint = (typeof PLUGIN_ENTRYPOINTS)[number];

function asEntrypoint(value: string): PluginEntrypoint {
  if ((PLUGIN_ENTRYPOINTS as readonly string[]).includes(value)) {
    return value as PluginEntrypoint;
  }
  // The manifest is the only caller, so this means the manifest and the binary
  // have drifted apart — a plugin linked to a checkout newer than the binary
  // built from it. Failing loudly beats a plugin action that quietly does
  // nothing, which from inside herdr looks like a broken keybinding.
  throw new Error(`unknown plugin entrypoint: "${value}"`);
}

/**
 * The value after an option, or a refusal naming what was missing.
 *
 * `startsWith("-")` is the guard that matters: `--kind --dry-run` would
 * otherwise set the agent kind to "--dry-run" and lose the flag, then fail much
 * later with a confusing complaint about an unknown agent.
 */
function valueFor(argv: string[], i: number, option: string, expected: string): string {
  const value = argv[i + 1];
  if (!value || value.startsWith("-")) {
    throw new Error(`${option} needs ${expected}`);
  }
  return value;
}

export function parseArgs(argv: string[]): Args {
  const args: Args = {
    help: false,
    dryRun: false,
    list: false,
    teardown: false,
    fresh: false,
    attach: false,
    kind: DEFAULT_KIND,
    worktree: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--list") args.list = true;
    else if (arg === "--teardown") args.teardown = true;
    else if (arg === "--new") args.fresh = true;
    else if (arg === "--attach") args.attach = true;
    else if (arg === "-w" || arg === "--worktree") args.worktree = true;
    else if (arg === "--branch") {
      args.branch = valueFor(argv, i, "--branch", "a branch name");
      i += 1;
    }
    else if (arg === "--plugin-action") {
      args.pluginAction = asEntrypoint(
        valueFor(argv, i, "--plugin-action", "an entrypoint name"),
      );
      i += 1;
    }
    else if (arg === "--plugin-pane") {
      args.pluginPane = asEntrypoint(
        valueFor(argv, i, "--plugin-pane", "an entrypoint name"),
      );
      i += 1;
    }
    else if (arg === "--kind") {
      args.kind = valueFor(argv, i, "--kind", "an agent name");
      i += 1;
    }
    else if (arg === "--workspace") {
      args.workspace = valueFor(argv, i, "--workspace", "a workspace id or label");
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
    resolvePluginContext(process.env)
      ? "plugin"
      : fromZed && isDirectory(fromZed)
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

function sessionSources(socketPath: string) {
  return {
    agents: listAgents(socketPath),
    tabs: listAllTabs(socketPath),
    records: readRecords(socketPath),
  };
}

/**
 * Offer what already exists before making more.
 *
 * Closing the terminal you were attached from leaves the tab and its agent
 * running in the herdr server. Without this, the next run in the same project
 * silently creates a second session and the first becomes invisible.
 *
 * Returns an exit code when it handled the run, or null to carry on and create.
 */
function offerExisting(sessions: ExistingSession[], socketPath: string): number | null {
  console.log(
    `${sessions.length} session${sessions.length === 1 ? "" : "s"} already open here:\n`,
  );
  for (const row of formatPickerRows(sessions, Date.now())) console.log(row);

  if (!isInteractive()) {
    console.error(
      "\nNot a terminal, so nothing was chosen." +
        "\nRun with --new to create another, or --attach to pick one.",
    );
    return EXIT.needsChoice;
  }

  const outcome = resolveChoice(promptChoice("\nChoose: "), sessions);

  if (outcome.kind === "focus") {
    attachToPane(socketPath, outcome.session.paneId, outcome.session.label ?? "");
  }
  if (outcome.kind === "create") return null;
  if (outcome.kind === "invalid") {
    console.error("Not one of the options — nothing done.");
    return EXIT.usage;
  }
  return EXIT.ok;
}

/** `--attach`: everything live, wherever it is. */
function attachAnywhere(): number {
  const { socketPath } = resolveSocket(process.env, listSessions());
  const groups = groupByProject(sessionSources(socketPath));
  const flat = groups.flatMap((g) => g.sessions);

  if (flat.length === 0) {
    console.log("No agent sessions are running.");
    return EXIT.ok;
  }

  console.log(`${flat.length} live session(s):\n`);
  let n = 0;
  for (const group of groups) {
    console.log(`  ${group.projectRoot}`);
    for (const s of group.sessions) {
      n += 1;
      const age = s.created ? `  ·  ${ago(s.created, Date.now())}` : "";
      console.log(`    ${n}) ${s.status}  ·  ${s.label ?? s.paneId}${age}`);
    }
  }

  if (!isInteractive()) {
    console.error("\nNot a terminal, so nothing was chosen.");
    return EXIT.needsChoice;
  }

  const choice = parseChoice(promptChoice("\nChoose: "), flat.length);
  if (choice.kind === "existing") {
    const chosen = flat[choice.index]!;
    attachToPane(socketPath, chosen.paneId, chosen.label ?? "");
  }
  if (choice.kind === "invalid") {
    console.error("Not one of the options — nothing done.");
    return EXIT.usage;
  }
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

/**
 * Returns the pane alongside the exit code: from a terminal the tool attaches
 * and never comes back, but as a plugin it has to focus what it just made, and
 * only this function knows which pane that is.
 */
function create(plan: ResolvedPlan): { code: number; paneId: string | null } {
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
    return { code: EXIT.herdrUnavailable, paneId: rootPane.pane_id };
  }

  console.log(formatCreated(summary));

  if (shouldAttach({ env: process.env, mode: "create", agentStarted: true })) {
    // Does not return: this terminal becomes the session.
    attachToPane(plan.socketPath, rootPane.pane_id, plan.label);
  }

  return { code: EXIT.ok, paneId: rootPane.pane_id };
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
    attachToPane(socketPath, result.rootPane.pane_id, label);
  }

  return EXIT.ok;
}


/**
 * herdr invoked us as a plugin action.
 *
 * There is no terminal here at all — herdr runs action commands with no tty on
 * any stream and captures their output into `herdr plugin log`. So this decides
 * and delegates: with nothing already open for the project it creates a session
 * outright, and otherwise hands over to the popup pane, which is the only
 * placement that can ask a question.
 */
function pluginPick(): number {
  const pluginId = process.env.HERDR_PLUGIN_ID;
  if (!pluginId) {
    console.error(
      "--plugin-action is herdr's entry point, not a command to run by hand.",
    );
    return EXIT.usage;
  }

  const { socketPath } = resolveSocket(process.env, listSessions());
  const projectRoot = resolveProjectRoot(process.env, process.cwd(), {
    isDirectory,
    gitToplevel,
  });
  const existing = matchExistingSessions({
    ...sessionSources(socketPath),
    projectRoot,
  });

  if (existing.length > 0) {
    openPluginPane(socketPath, { pluginId, entrypoint: "picker", projectRoot });
    return EXIT.ok;
  }

  // Nothing open for this project, so there is nothing to choose between. A
  // popup listing one row and a "start a new session" line would be a question
  // with one answer.
  const { code, paneId } = create(resolveOrSpread(parseArgs([])));
  if (code === EXIT.ok && paneId) focusSession(socketPath, paneId);

  return code;
}


/**
 * The popup pane herdr opened on our behalf: the picker, asked properly.
 *
 * Everything the user must read goes to stderr. In a popup that is the pty,
 * while stdout is piped into `herdr plugin log` — so the familiar console.log
 * would print the whole list somewhere nobody can see it, and the prompt would
 * appear to hang. `say` and `promptOnStderr` exist for exactly that.
 *
 * Nothing here attaches. Inside herdr the equivalent of handing your terminal
 * over is focusing the tab, and the popup closes as soon as this returns.
 */
function pluginPickPane(): number {
  const { socketPath } = resolveSocket(process.env, listSessions());
  const projectRoot = resolveProjectRoot(process.env, process.cwd(), {
    isDirectory,
    gitToplevel,
  });
  const sessions = matchExistingSessions({
    ...sessionSources(socketPath),
    projectRoot,
  });

  const createAndFocus = (): number => {
    const { code, paneId } = create(resolveOrSpread(parseArgs([])));
    if (code === EXIT.ok && paneId) focusSession(socketPath, paneId);
    return code;
  };

  // The action counted these before opening the popup, so an empty list here
  // means the last session closed in between. Asking which of nothing to resume
  // would be a worse answer than simply making one.
  if (sessions.length === 0) return createAndFocus();

  say(
    `${sessions.length} session${sessions.length === 1 ? "" : "s"} already open here:\n`,
  );
  for (const row of formatPickerRows(sessions, Date.now())) say(row);

  const outcome = resolveChoice(promptOnStderr("\nChoose: "), sessions);

  if (outcome.kind === "create") return createAndFocus();
  if (outcome.kind === "focus") {
    if (focusSession(socketPath, outcome.session.paneId)) return EXIT.ok;

    say("That session has closed since the list was drawn — nothing done.");
    return EXIT.usage;
  }
  if (outcome.kind === "invalid") {
    say("Not one of the options — nothing done.");
    return EXIT.usage;
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
    if (args.pluginPane) return pluginPickPane();
    if (args.pluginAction) return pluginPick();
    if (args.list) return list();
    if (args.teardown) return teardown(args);
    if (args.attach) return attachAnywhere();

    // Before anything is created: herdr only rejects a bad kind at agent start,
    // by which point a tab exists.
    assertKnownKind(args.kind, agentKinds());

    if (args.worktree) return createInWorktree(args);

    // Resume rather than duplicate, unless told otherwise. Skipped for --dry-run,
    // which reports and changes nothing.
    if (!args.fresh && !args.dryRun) {
      const { socketPath } = resolveSocket(process.env, listSessions());
      const projectRoot = resolveProjectRoot(process.env, process.cwd(), {
        isDirectory,
        gitToplevel,
      });
      const existing = matchExistingSessions({
        ...sessionSources(socketPath),
        projectRoot,
      });

      if (existing.length > 0) {
        const handled = offerExisting(existing, socketPath);
        if (handled !== null) return handled;
      }
    }

    const plan = resolveOrSpread(args);

    if (args.dryRun) {
      console.log(formatPlan(plan));
      return EXIT.ok;
    }

    return create(plan).code;
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
