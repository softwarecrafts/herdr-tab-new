import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

/**
 * `-w --dry-run` once created a real worktree, workspace and agent, because
 * worktree mode was dispatched before --dry-run was ever consulted. This runs
 * the real CLI against a stub `herdr` that answers only the two read-only
 * lookups, and records every call, so "created nothing" is asserted rather
 * than assumed.
 */

const repo = resolve(import.meta.dir, "..", "..");
const fixtures = join(repo, "test", "fixtures");

let dir: string;
let log: string;
let stub: string;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "htn-dry-run-"));
  log = join(dir, "calls.log");
  stub = join(dir, "herdr");
  writeFileSync(log, "");
  writeFileSync(
    stub,
    `#!/bin/sh
echo "$*" >> "${log}"
case "$1 $2" in
  "session list") cat "${fixtures}/sessions.json" ;;
  "agent start") cat "${fixtures}/agent-start-help.txt" ;;
  *) echo '{"error":{"code":"stub","message":"the stub herdr refuses everything else"}}' >&2; exit 1 ;;
esac
`,
  );
  chmodSync(stub, 0o755);
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

function run(args: string[]) {
  const env: Record<string, string | undefined> = {
    ...process.env,
    HERDR_BIN_PATH: stub,
  };
  for (const key of ["HERDR_SOCKET_PATH", "HERDR_SESSION", "HERDR_ENV", "ZED_WORKTREE_ROOT"]) {
    delete env[key];
  }
  writeFileSync(log, "");
  const result = Bun.spawnSync(["bun", "index.ts", ...args], { cwd: repo, env });
  const calls = readFileSync(log, "utf8").split("\n").filter(Boolean);
  return {
    code: result.exitCode,
    out: result.stdout.toString(),
    err: result.stderr.toString(),
    calls,
  };
}

describe("-w --dry-run", () => {
  test("exits cleanly and previews the worktree it would make", () => {
    const { code, out } = run(["-w", "--branch", "dry-run-probe", "--dry-run"]);

    expect(code).toBe(0);
    expect(out).toMatch(/would/i);
    expect(out).toContain("dry-run-probe");
  });

  test("creates nothing: herdr only ever gets the two read-only lookups", () => {
    const { calls } = run(["-w", "--branch", "dry-run-probe", "--dry-run"]);

    const mutating = calls.filter(
      (call) => !/^(session list|agent start --help)/.test(call),
    );
    expect(mutating).toEqual([]);
  });

  test("an unknown agent kind is still rejected before anything else", () => {
    const { code, calls } = run(["-w", "--kind", "nonsense", "--dry-run"]);

    expect(code).not.toBe(0);
    expect(calls.some((call) => call.startsWith("worktree"))).toBe(false);
  });
});
