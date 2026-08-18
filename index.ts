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
import { layoutStatusFor, parseLayouts } from "./src/spreader/layout.ts";
import {
  formatAgentFailed,
  formatAmbiguous,
  formatCreated,
  formatNoMatch,
  formatPlan,
  type CreatedSummary,
  type ResolvedPlan,
} from "./src/cli/output.ts";
import {
  createTab,
  gitBranch,
  gitToplevel,
  home,
  isDirectory,
  listPanes,
  listSessions,
  listTabs,
  listWorkspaces,
  readLayoutFiles,
  runSpread,
  spreadAvailable,
  startAgent,
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
  -h, --help             Show this help.

If no live workspace matches the project, the matching herdr-spreader layout is
applied with \`spread\` and resolution is retried.

Exit codes:
  0 ok   1 usage   2 herdr unavailable   3 no matching workspace   4 ambiguous`;

type Args = {
  help: boolean;
  dryRun: boolean;
  workspace?: string;
  name?: string;
};

export function parseArgs(argv: string[]): Args {
  const args: Args = { help: false, dryRun: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    if (arg === "-h" || arg === "--help") args.help = true;
    else if (arg === "--dry-run") args.dryRun = true;
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
    agentKind: "claude",
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

  try {
    startAgent(plan.socketPath, {
      name: plan.label,
      kind: plan.agentKind,
      paneId: rootPane.pane_id,
    });
  } catch (err) {
    // The tab is real and useful even without the agent, so it stays.
    console.error(
      formatAgentFailed({ ...summary, reason: (err as Error).message }),
    );
    return EXIT.herdrUnavailable;
  }

  console.log(formatCreated(summary));
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
