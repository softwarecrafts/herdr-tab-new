import { describe, expect, test } from "bun:test";
import { isShellNotReady } from "../../src/herdr/create.ts";
import { HerdrError } from "../../src/herdr/client.ts";

describe("isShellNotReady", () => {
  test("recognises herdr's complaint that the pane has no shell yet", () => {
    // Observed live: `tab create` returns the pane before its shell has reached
    // an interactive prompt, so an immediate `agent start` is rejected. Waiting
    // a moment and repeating the identical call succeeds.
    const err = new HerdrError(
      "invalid_request",
      "agent target pane w2:p2 is not an available shell",
    );

    expect(isShellNotReady(err)).toBe(true);
  });

  test("does not treat a genuinely bad request as retryable", () => {
    const err = new HerdrError(
      "invalid_request",
      "unsupported agent kind: nonsense",
    );

    expect(isShellNotReady(err)).toBe(false);
  });

  test("does not retry a dead server", () => {
    const err = new HerdrError(
      "server_not_running",
      "no herdr server is running at /tmp/nope.sock",
    );

    expect(isShellNotReady(err)).toBe(false);
  });

  test("ignores errors that are not from herdr", () => {
    expect(isShellNotReady(new Error("something else"))).toBe(false);
  });
});
