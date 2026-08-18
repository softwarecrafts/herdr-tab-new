import { describe, expect, test } from "bun:test";
import { HerdrError, parseHerdrResponse } from "../../src/herdr/client.ts";

const fixture = (name: string) =>
  Bun.file(new URL(`../fixtures/${name}`, import.meta.url)).text();

describe("parseHerdrResponse", () => {
  test("throws when herdr reports an error, despite exiting 0", async () => {
    const stdout = await fixture("error-server-down.json");

    expect(() => parseHerdrResponse(stdout)).toThrow(HerdrError);
  });

  test("carries herdr's own error code and message", async () => {
    const stdout = await fixture("error-server-down.json");

    try {
      parseHerdrResponse(stdout);
      throw new Error("expected parseHerdrResponse to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(HerdrError);
      const herdrErr = err as HerdrError;
      expect(herdrErr.code).toBe("server_not_running");
      expect(herdrErr.message).toContain("no herdr server is running");
    }
  });

  test("returns the result payload on success", async () => {
    const stdout = await fixture("workspaces.json");

    const result = parseHerdrResponse(stdout) as { workspaces: unknown[] };

    expect(result.workspaces).toHaveLength(4);
  });

  test("throws when herdr output is not valid JSON", () => {
    expect(() => parseHerdrResponse("herdr: command not found")).toThrow(
      HerdrError,
    );
  });
});
