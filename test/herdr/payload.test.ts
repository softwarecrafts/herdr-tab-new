import { describe, expect, test } from "bun:test";
import { HerdrError, selectHerdrPayload } from "../../src/herdr/client.ts";

describe("selectHerdrPayload", () => {
  test("reads herdr's error from stderr when stdout is empty", () => {
    // herdr writes success to stdout but errors to stderr — and exits 0 either
    // way. Reading only stdout turns a clear "server not running" into a
    // confusing "herdr produced no output".
    const stderr =
      '{"id":"cli:workspace:list","error":{"code":"server_not_running","message":"no herdr server is running at /tmp/nope.sock"}}';

    expect(selectHerdrPayload("", stderr)).toBe(stderr);
  });

  test("prefers stdout when herdr succeeded", () => {
    expect(selectHerdrPayload('{"result":{"ok":true}}', "some warning")).toBe(
      '{"result":{"ok":true}}',
    );
  });

  test("throws when herdr said nothing at all", () => {
    expect(() => selectHerdrPayload("", "   ")).toThrow(HerdrError);
  });

  test("reports a missing herdr binary distinctly", () => {
    try {
      selectHerdrPayload("", "");
      throw new Error("expected selectHerdrPayload to throw");
    } catch (err) {
      expect((err as HerdrError).code).toBe("herdr_unavailable");
    }
  });
});
