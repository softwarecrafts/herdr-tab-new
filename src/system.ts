import {
  appendFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildHerdrInvocation,
  HerdrError,
  parseHerdrResponse,
  selectHerdrPayload,
} from "./herdr/client.ts";
import type { Pane, Session, Tab, Workspace } from "./herdr/types.ts";
import { LAYOUT_DIR, type LayoutFile } from "./spreader/layout.ts";
import { FALLBACK_KINDS, parseAgentKinds } from "./agent/kinds.ts";
import {
  parseWorktreeCreated,
  parseWorktreeOpened,
  worktreeCreateArgs,
  worktreeOpenArgs,
  type WorktreeInput,
  type WorktreeResult,
} from "./herdr/worktree.ts";
import {
  parseRecords,
  stateFileFor,
  type TabRecord,
  toRecordLine,
} from "./state/record.ts";
import {
  agentStartArgs,
  type AgentStarted,
  type AgentStartInput,
  isShellNotReady,
  parseAgentStarted,
  parseTabCreated,
  tabCreateArgs,
  type TabCreated,
  type TabCreateInput,
} from "./herdr/create.ts";

/**
 * Everything that touches the outside world. Deliberately thin — all judgement
 * lives in the pure modules under src/resolve, which is what the tests exercise.
 */

function capture(cmd: string[], env?: Record<string, string | undefined>) {
  try {
    const proc = Bun.spawnSync({
      cmd,
      env: (env ?? process.env) as Record<string, string>,
      stdout: "pipe",
      stderr: "pipe",
    });
    return {
      ok: proc.exitCode === 0,
      stdout: proc.stdout.toString(),
      stderr: proc.stderr.toString(),
    };
  } catch (err) {
    return { ok: false, stdout: "", stderr: String(err) };
  }
}

export function runHerdr(args: string[], socketPath: string): unknown {
  const { cmd, env } = buildHerdrInvocation(args, socketPath, process.env);
  const { stdout, stderr } = capture(cmd, env);

  return parseHerdrResponse(selectHerdrPayload(stdout, stderr));
}

/**
 * `herdr session list --json` answers with a bare {"sessions":[...]} rather than
 * the {"id":..,"result":..} envelope every other subcommand uses, and it needs
 * no socket — it is how we *find* the socket.
 */
export function listSessions(): Session[] {
  const { stdout, stderr } = capture(["herdr", "session", "list", "--json"]);
  const payload = selectHerdrPayload(stdout, stderr);

  try {
    const parsed = JSON.parse(payload) as { sessions?: Session[] };
    return parsed.sessions ?? [];
  } catch {
    throw new HerdrError(
      "unparseable_response",
      `could not read the session list as JSON: ${payload.trim().slice(0, 200)}`,
    );
  }
}

export const listPanes = (socketPath: string): Pane[] =>
  (runHerdr(["pane", "list"], socketPath) as { panes: Pane[] }).panes;

export const listWorkspaces = (socketPath: string): Workspace[] =>
  (runHerdr(["workspace", "list"], socketPath) as { workspaces: Workspace[] })
    .workspaces;

export const listTabs = (socketPath: string, workspaceId: string): Tab[] =>
  (
    runHerdr(["tab", "list", "--workspace", workspaceId], socketPath) as {
      tabs: Tab[];
    }
  ).tabs;

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function gitToplevel(cwd: string): string | null {
  const { ok, stdout } = capture([
    "git",
    "-C",
    cwd,
    "rev-parse",
    "--show-toplevel",
  ]);
  return ok && stdout.trim() ? stdout.trim() : null;
}

/** null on a detached HEAD or outside a repo — both mean "no branch to name it after". */
export function gitBranch(cwd: string): string | null {
  const { ok, stdout } = capture([
    "git",
    "-C",
    cwd,
    "symbolic-ref",
    "--quiet",
    "--short",
    "HEAD",
  ]);
  return ok && stdout.trim() ? stdout.trim() : null;
}

/**
 * Read every layout in ~/.herdr-spreader/. One workspace per file; the basename
 * is what `spread` takes as its argument. Returns null when the directory is
 * unreadable, which the caller reports as "unknown" rather than "absent".
 */
export function readLayoutFiles(home = homedir()): LayoutFile[] | null {
  const dir = join(home, LAYOUT_DIR);

  try {
    return readdirSync(dir)
      .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
      .map((f) => ({
        file: f.replace(/\.ya?ml$/, ""),
        text: readFileSync(join(dir, f), "utf8"),
      }));
  } catch {
    return null;
  }
}

function whichSpread(): string | null {
  const { ok, stdout } = capture(["/usr/bin/which", "spread"]);
  return ok && stdout.trim() ? stdout.trim() : null;
}

/** `spread` is Andrew's wrapper; only the no-workspace path needs it. */
export const spreadAvailable = (): boolean => whichSpread() !== null;

/**
 * Build a workspace from its layout. `spread` is idempotent — it focuses an
 * already-open workspace rather than building a second copy with duplicate dev
 * servers — so it is safe to call whenever resolution came up empty.
 */
export function runSpread(layoutFile: string): {
  ok: boolean;
  output: string;
} {
  const bin = whichSpread();
  if (!bin) return { ok: false, output: "spread is not on PATH" };

  const { ok, stdout, stderr } = capture([bin, layoutFile]);
  return { ok, output: `${stdout}${stderr}`.trim() };
}

export function createTab(
  socketPath: string,
  input: TabCreateInput,
): TabCreated {
  return parseTabCreated(runHerdr(tabCreateArgs(input), socketPath));
}

/** How long to keep waiting for the new pane's shell to reach a prompt. */
export const SHELL_WAIT_MS = 10_000;
const SHELL_POLL_MS = 250;

/**
 * Start the agent, waiting out the gap between herdr handing back a pane and
 * that pane's shell reaching an interactive prompt. Only that specific
 * rejection is retried — anything else fails immediately, so a bad agent kind
 * still reports at once.
 */
export function startAgent(
  socketPath: string,
  input: AgentStartInput,
  shellWaitMs = SHELL_WAIT_MS,
): AgentStarted {
  const deadline = Date.now() + shellWaitMs;

  for (;;) {
    try {
      return parseAgentStarted(runHerdr(agentStartArgs(input), socketPath));
    } catch (err) {
      if (!isShellNotReady(err) || Date.now() >= deadline) throw err;
      Bun.sleepSync(SHELL_POLL_MS);
    }
  }
}

export const home = homedir;

export function closeTab(socketPath: string, tabId: string): void {
  runHerdr(["tab", "close", tabId], socketPath);
}

/**
 * The kinds this herdr can start, read from its own help so a herdr upgrade
 * that adds an agent works without a code change. Falls back to the baked-in
 * list only if the help stops being parseable.
 */
export function agentKinds(): string[] {
  const { stdout, stderr } = capture(["herdr", "agent", "start", "--help"]);
  return parseAgentKinds(`${stdout}${stderr}`) ?? FALLBACK_KINDS;
}

/** Every live tab in the session, used to tell recorded tabs from vanished ones. */
export const listAllTabs = (socketPath: string): Tab[] =>
  (runHerdr(["tab", "list"], socketPath) as { tabs: Tab[] }).tabs;

/**
 * Append one record. O_APPEND makes a single short write atomic, so two runs at
 * once cannot lose each other's records — which a whole-file rewrite would.
 */
export function appendRecord(socketPath: string, record: TabRecord): void {
  const path = stateFileFor(socketPath, process.env.HERDR_TAB_NEW_STATE);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, toRecordLine(record), "utf8");
}

export function readRecords(socketPath: string): TabRecord[] {
  try {
    return parseRecords(
      readFileSync(
        stateFileFor(socketPath, process.env.HERDR_TAB_NEW_STATE),
        "utf8",
      ),
    );
  } catch {
    return [];
  }
}

export function createWorktree(
  socketPath: string,
  input: WorktreeInput,
): WorktreeResult {
  return parseWorktreeCreated(runHerdr(worktreeCreateArgs(input), socketPath));
}

export function openWorktree(
  socketPath: string,
  input: WorktreeInput,
): WorktreeResult {
  return parseWorktreeOpened(runHerdr(worktreeOpenArgs(input), socketPath));
}

export function removeWorktree(socketPath: string, workspaceId: string): void {
  runHerdr(
    ["worktree", "remove", "--workspace", workspaceId, "--force"],
    socketPath,
  );
}
