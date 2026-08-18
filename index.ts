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
import { layoutStatusFor } from "./src/spreader/layout.ts";
import {
  formatAmbiguous,
  formatNoMatch,
  formatPlan,
  type ResolvedPlan,
} from "./src/cli/output.ts";
import {
  gitBranch,
  gitToplevel,
  home,
  isDirectory,
  listPanes,
  listSessions,
  listTabs,
  listWorkspaces,
  readSpreaderConfig,
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

Milestone 1 resolves and reports only; it never changes herdr's state.

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

function resolvePlan(args: Args): ResolvedPlan {
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

  const candidates = matchWorkspaces(listPanes(socketPath), projectRoot);
  const workspace = chooseWorkspace(
    candidates,
    listWorkspaces(socketPath),
    args.workspace,
    projectRoot,
  );

  const existingLabels = listTabs(socketPath, workspace.workspace_id).map(
    (t) => t.label,
  );

  return {
    sessionName,
    socketPath,
    workspace,
    label: generateLabel({
      branch: gitBranch(projectRoot),
      projectRoot,
      existingLabels,
      requested: args.name,
    }),
    projectRoot,
    branch: gitBranch(projectRoot),
    rootSource,
    agentKind: "claude",
  };
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
    console.log(formatPlan(resolvePlan(args)));
    if (!args.dryRun) {
      console.log("\nCreating the tab arrives in milestone 2 — nothing was changed.");
    }
    return EXIT.ok;
  } catch (err) {
    if (err instanceof NoWorkspaceMatchError) {
      console.error(
        formatNoMatch(
          err.projectRoot,
          layoutStatusFor(readSpreaderConfig(), err.projectRoot, home()),
        ),
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
