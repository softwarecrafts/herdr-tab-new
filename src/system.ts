import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  buildHerdrInvocation,
  HerdrError,
  parseHerdrResponse,
  selectHerdrPayload,
} from "./herdr/client.ts";
import type { Pane, Session, Tab, Workspace } from "./herdr/types.ts";
import { SPREADER_CONFIG_PATH } from "./spreader/layout.ts";

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

export function readSpreaderConfig(home = homedir()): string | null {
  for (const name of ["config.yaml", "config.yml"]) {
    const path = join(home, SPREADER_CONFIG_PATH).replace(/config\.yaml$/, name);
    if (existsSync(path)) {
      try {
        return require("node:fs").readFileSync(path, "utf8") as string;
      } catch {
        return null;
      }
    }
  }
  return null;
}

export const home = homedir;
