import { describe, expect, test } from "bun:test";
import {
  resolveSocket,
  SessionNotRunningError,
  UnknownSessionError,
} from "../../src/resolve/socket.ts";
import type { Session } from "../../src/herdr/types.ts";

const sessions: Session[] = [
  {
    name: "default",
    running: true,
    default: true,
    socket_path: "/Users/andrew/.config/herdr/herdr.sock",
    session_dir: "/Users/andrew/.config/herdr",
  },
  {
    name: "hamilton",
    running: true,
    default: false,
    socket_path: "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
    session_dir: "/Users/andrew/.config/herdr/sessions/hamilton",
  },
];

describe("resolveSocket", () => {
  test("uses HERDR_SOCKET_PATH above everything else", () => {
    const resolved = resolveSocket(
      {
        HERDR_SOCKET_PATH: "/tmp/explicit.sock",
        HERDR_SESSION: "hamilton",
      },
      sessions,
    );

    expect(resolved.socketPath).toBe("/tmp/explicit.sock");
  });

  test("maps HERDR_SESSION to that session's socket", () => {
    // The herdr CLI ignores HERDR_SESSION entirely, so we do this mapping
    // ourselves. Without it, a named session silently resolves to the default's
    // workspaces.
    const resolved = resolveSocket({ HERDR_SESSION: "hamilton" }, sessions);

    expect(resolved.socketPath).toBe(
      "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
    );
    expect(resolved.sessionName).toBe("hamilton");
  });

  test("falls back to the default session", () => {
    const resolved = resolveSocket({}, sessions);

    expect(resolved.socketPath).toBe("/Users/andrew/.config/herdr/herdr.sock");
    expect(resolved.sessionName).toBe("default");
  });

  test("rejects a session name that does not exist", () => {
    expect(() => resolveSocket({ HERDR_SESSION: "nope" }, sessions)).toThrow(
      UnknownSessionError,
    );
  });

  test("rejects a session that exists but is stopped", () => {
    const stopped: Session[] = [
      { ...sessions[0]! },
      { ...sessions[1]!, running: false },
    ];

    expect(() => resolveSocket({ HERDR_SESSION: "hamilton" }, stopped)).toThrow(
      SessionNotRunningError,
    );
  });

  test("ignores an empty HERDR_SESSION", () => {
    const resolved = resolveSocket({ HERDR_SESSION: "" }, sessions);

    expect(resolved.sessionName).toBe("default");
  });
});
