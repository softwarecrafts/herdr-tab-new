import type { Session } from "../herdr/types.ts";

/**
 * Which herdr session are we talking to?
 *
 * Note that the herdr CLI does NOT honour HERDR_SESSION — running
 * `HERDR_SESSION=hamilton herdr workspace list` returns the *default* session's
 * workspaces. Only HERDR_SOCKET_PATH actually reaches a named session, so we do
 * the name -> socket mapping here and pass the socket explicitly. Getting this
 * wrong is silent: you would create tabs in the wrong session and be told
 * everything went fine.
 */

export class UnknownSessionError extends Error {
  constructor(readonly requested: string, readonly known: string[]) {
    super(
      `no herdr session named "${requested}" (known: ${known.join(", ") || "none"})`,
    );
    this.name = "UnknownSessionError";
  }
}

export class SessionNotRunningError extends Error {
  constructor(readonly name: string) {
    super(`herdr session "${name}" exists but is not running`);
    this.name = "SessionNotRunningError";
  }
}

export class NoDefaultSessionError extends Error {
  constructor() {
    super("no running herdr session found; run `herdr` to start one");
    this.name = "NoDefaultSessionError";
  }
}

export type ResolvedSocket = {
  socketPath: string;
  sessionName: string;
};

export function resolveSocket(
  env: Record<string, string | undefined>,
  sessions: Session[],
): ResolvedSocket {
  const explicit = env.HERDR_SOCKET_PATH;
  if (explicit) {
    const known = sessions.find((s) => s.socket_path === explicit);
    return { socketPath: explicit, sessionName: known?.name ?? "(explicit)" };
  }

  const requested = env.HERDR_SESSION;
  if (requested) {
    const found = sessions.find((s) => s.name === requested);
    if (!found) {
      throw new UnknownSessionError(
        requested,
        sessions.map((s) => s.name),
      );
    }
    if (!found.running) throw new SessionNotRunningError(requested);
    return { socketPath: found.socket_path, sessionName: found.name };
  }

  const fallback = sessions.find((s) => s.default && s.running);
  if (!fallback) throw new NoDefaultSessionError();

  return { socketPath: fallback.socket_path, sessionName: fallback.name };
}
