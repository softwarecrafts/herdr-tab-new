/**
 * herdr exits 0 even when it fails — a dead socket returns
 * `{"error":{"code":"server_not_running",...}}` with status 0. Every herdr call
 * therefore has to be judged on the JSON body, never on the exit status. This
 * module is the single place that happens.
 */

export class HerdrError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrError";
    this.code = code;
  }
}

type HerdrResponse = {
  error?: { code?: string; message?: string };
  result?: unknown;
};

export function parseHerdrResponse(stdout: string): unknown {
  let parsed: HerdrResponse;

  try {
    parsed = JSON.parse(stdout) as HerdrResponse;
  } catch {
    throw new HerdrError(
      "unparseable_response",
      `could not read herdr's response as JSON: ${stdout.trim().slice(0, 200)}`,
    );
  }

  if (parsed.error) {
    throw new HerdrError(
      parsed.error.code ?? "unknown",
      parsed.error.message ?? "herdr reported an error with no message",
    );
  }

  return parsed.result;
}

export type HerdrInvocation = {
  cmd: string[];
  env: Record<string, string | undefined>;
};

/**
 * herdr has no --socket flag. HERDR_SOCKET_PATH is the only thing that actually
 * redirects it at a named session — HERDR_SESSION is read by nothing in the CLI
 * — so we set the socket explicitly and clear HERDR_SESSION to stop it being
 * mistaken for the source of truth further down.
 */
export function buildHerdrInvocation(
  args: string[],
  socketPath: string,
  env: Record<string, string | undefined>,
): HerdrInvocation {
  const { HERDR_SESSION: _dropped, ...rest } = env;

  return {
    cmd: ["herdr", ...args],
    env: { ...rest, HERDR_SOCKET_PATH: socketPath },
  };
}

/**
 * herdr writes success to stdout but errors to stderr — while exiting 0 in both
 * cases. Reading only stdout turns a clear "no herdr server is running" into a
 * confusing "herdr produced no output", so we take whichever stream spoke.
 */
export function selectHerdrPayload(stdout: string, stderr: string): string {
  if (stdout.trim()) return stdout;
  if (stderr.trim()) return stderr;

  throw new HerdrError(
    "herdr_unavailable",
    "herdr produced no output at all — is it installed and on PATH?",
  );
}
