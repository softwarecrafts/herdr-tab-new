import { describe, expect, test } from "bun:test";
import { buildHerdrInvocation, herdrBin } from "../../src/herdr/client.ts";

describe("herdrBin", () => {
  test("prefers HERDR_BIN_PATH over whatever is on PATH", () => {
    // herdr injects this into every plugin command. Using it pins the call to
    // the binary actually serving the socket, which is not necessarily the one
    // on PATH — during `herdr update --handoff` they differ.
    expect(herdrBin({ HERDR_BIN_PATH: "/opt/herdr/0.8.2/bin/herdr" })).toBe(
      "/opt/herdr/0.8.2/bin/herdr",
    );
  });

  test("falls back to PATH lookup outside herdr", () => {
    expect(herdrBin({})).toBe("herdr");
  });

  test("ignores an empty HERDR_BIN_PATH rather than execing the empty string", () => {
    expect(herdrBin({ HERDR_BIN_PATH: "" })).toBe("herdr");
  });
});

describe("buildHerdrInvocation", () => {
  test("execs the binary named by HERDR_BIN_PATH", () => {
    const { cmd } = buildHerdrInvocation(["tab", "focus", "w2:t1"], "/tmp/s.sock", {
      HERDR_BIN_PATH: "/opt/herdr/0.8.2/bin/herdr",
    });

    expect(cmd).toEqual([
      "/opt/herdr/0.8.2/bin/herdr",
      "tab",
      "focus",
      "w2:t1",
    ]);
  });

  test("puts the resolved socket in the environment, not on the command line", () => {
    // herdr has no --socket flag; HERDR_SOCKET_PATH is the only lever that
    // actually redirects it to a named session.
    const { cmd, env } = buildHerdrInvocation(
      ["workspace", "list"],
      "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
      { PATH: "/usr/bin" },
    );

    expect(cmd).toEqual(["herdr", "workspace", "list"]);
    expect(env.HERDR_SOCKET_PATH).toBe(
      "/Users/andrew/.config/herdr/sessions/hamilton/herdr.sock",
    );
  });

  test("keeps the surrounding environment intact", () => {
    const { env } = buildHerdrInvocation(["pane", "list"], "/tmp/s.sock", {
      PATH: "/usr/bin",
      HOME: "/Users/andrew",
    });

    expect(env.PATH).toBe("/usr/bin");
    expect(env.HOME).toBe("/Users/andrew");
  });

  test("drops HERDR_SESSION so it cannot fight the socket we chose", () => {
    // The herdr CLI ignores HERDR_SESSION, but leaving it set is a trap for
    // anything downstream that does read it.
    const { env } = buildHerdrInvocation(["pane", "list"], "/tmp/s.sock", {
      HERDR_SESSION: "hamilton",
    });

    expect(env.HERDR_SESSION).toBeUndefined();
  });
});
