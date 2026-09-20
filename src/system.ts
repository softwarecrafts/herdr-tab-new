import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  buildHerdrInvocation,
  herdrBin,
  HerdrError,
  parseHerdrResponse,
  selectHerdrPayload,
} from "./herdr/client.ts";
import { focusArgs } from "./plugin/focus.ts";
import { paneOpenArgs, type PaneOpen } from "./plugin/pane-open.ts";
import type {
  AgentInfo,
  Pane,
  Session,
  Tab,
  Workspace,
} from "./herdr/types.ts";
import { LAYOUT_DIR, type LayoutFile } from "./spreader/layout.ts";
import { attachArgs, titleEscape } from "./cli/attach.ts";
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
  serializeRecords,
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
  const { stdout, stderr } = capture([herdrBin(process.env), "session", "list", "--json"]);
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

/** Whether a local branch of this name exists, so a preview can say "reused" or "new". */
export function gitBranchExists(cwd: string, branch: string): boolean {
  return capture([
    "git",
    "-C",
    cwd,
    "rev-parse",
    "--verify",
    "--quiet",
    `refs/heads/${branch}`,
  ]).ok;
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
  const { stdout, stderr } = capture([herdrBin(process.env), "agent", "start", "--help"]);
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

/**
 * `force` is opt-in. Teardown checks for uncommitted work itself and then calls
 * this without forcing, so herdr's own refusal is a second line of defence
 * rather than something we have already overridden.
 */
export function removeWorktree(
  socketPath: string,
  workspaceId: string,
  force = false,
): void {
  const args = ["worktree", "remove", "--workspace", workspaceId];
  if (force) args.push("--force");
  runHerdr(args, socketPath);
}

/**
 * Does this worktree hold work that removing it would lose?
 *
 * Anything `git status --porcelain` reports counts, untracked files included —
 * matching git's own `worktree remove`, and because a new file an agent wrote
 * but never committed is exactly what is worth protecting.
 *
 * A path that no longer exists is not dirty: there is nothing there to lose.
 */
export function isWorktreeDirty(path: string): boolean {
  if (!existsSync(path)) return false;

  const { ok, stdout } = capture([
    "git",
    "-C",
    path,
    "status",
    "--porcelain",
    "--untracked-files=normal",
  ]);

  // If git cannot answer, assume there is something to lose.
  if (!ok) return true;
  return stdout.trim().length > 0;
}

/**
 * Replace the record file wholesale, which teardown needs in order to prune.
 *
 * Written to a temp file and renamed, so a reader never sees a half-written
 * file. Known cost: this is the one operation that is not append-only, so a
 * record appended between the read and the rename is lost. That window is
 * milliseconds, during a command run deliberately — but it is real, and it is
 * why every other write in this tool is an append.
 */
export function writeRecords(socketPath: string, records: TabRecord[]): void {
  const path = stateFileFor(socketPath, process.env.HERDR_TAB_NEW_STATE);
  mkdirSync(dirname(path), { recursive: true });

  const temp = `${path}.${process.pid}.tmp`;
  writeFileSync(temp, serializeRecords(records), "utf8");
  renameSync(temp, path);
}

/** Names of every live agent, so a new one can avoid colliding with them. */
export function listAgentNames(socketPath: string): string[] {
  const { agents } = runHerdr(["agent", "list"], socketPath) as {
    agents: { name?: string }[];
  };
  return agents.map((a) => a.name).filter((n): n is string => Boolean(n));
}

/**
 * Hand this terminal over to a herdr pane and never come back.
 *
 * stdio is inherited rather than piped, so the attached agent genuinely owns
 * the terminal, and we exit with whatever status it exits with. This does not
 * return: by design the process you started *becomes* the session.
 */
export function attachToPane(
  socketPath: string,
  paneId: string,
  label = "",
): never {
  // Named before handing over, so the tab is not left called "herdr-tab-new".
  // The agent's own title replaces this as soon as it paints one.
  const title = titleEscape(label);
  if (title) process.stdout.write(title);

  const { cmd, env } = buildHerdrInvocation(
    attachArgs(paneId),
    socketPath,
    process.env,
  );

  const proc = Bun.spawnSync({
    cmd,
    env: env as Record<string, string>,
    stdio: ["inherit", "inherit", "inherit"],
  });

  process.exit(proc.exitCode ?? 0);
}

/** Full live agent records, for deciding whether a session already exists. */
export const listAgents = (socketPath: string): AgentInfo[] =>
  (runHerdr(["agent", "list"], socketPath) as { agents: AgentInfo[] }).agents;

/**
 * Ask a question and read one line back. The only interactive part of the tool,
 * and only ever reached with a terminal on stdin.
 */
export function promptChoice(message: string): string {
  return prompt(message) ?? "";
}

export const isInteractive = (): boolean => Boolean(process.stdin.isTTY);

/**
 * Ask a question inside a plugin popup pane.
 *
 * A popup gets stdin and stderr on the pty, but its stdout is piped into
 * `herdr plugin log`. So console.log prints where nobody can see it, and Bun's
 * prompt() — which writes its message to stdout — asks a question that never
 * appears on screen while apparently hanging. The question goes to stderr, and
 * prompt() is used for nothing but the line read.
 */
export function promptOnStderr(message: string): string {
  process.stderr.write(message);
  return prompt("") ?? "";
}

/** Everything the user must actually see inside a popup. */
export function say(line: string): void {
  process.stderr.write(`${line}\n`);
}

/**
 * Bring an existing session to the front, from inside herdr.
 *
 * Returns false when the pane has gone since it was listed, so the caller can
 * say so rather than reporting a focus that never happened.
 */
export function focusSession(socketPath: string, paneId: string): boolean {
  const steps = focusArgs(listPanes(socketPath), paneId);
  if (!steps) return false;

  for (const step of steps) runHerdr(step, socketPath);
  return true;
}

/** Ask herdr to open one of our declared plugin panes. */
export function openPluginPane(socketPath: string, open: PaneOpen): void {
  runHerdr(paneOpenArgs(open), socketPath);
}
