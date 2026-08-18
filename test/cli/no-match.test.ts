import { describe, expect, test } from "bun:test";
import { formatNoMatch } from "../../src/cli/output.ts";

const ROOT = "/Users/andrew/src/naptime";

describe("formatNoMatch", () => {
  test("names the exact spread command when spread is missing", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "declared", file: "naptime", label: "naptime" },
      spreadAvailable: false,
    });

    expect(out).toContain("spread naptime");
  });

  test("explains that spread itself is what is missing", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "declared", file: "naptime", label: "naptime" },
      spreadAvailable: false,
    });

    expect(out).toContain("not on PATH");
  });

  test("reports when spread ran but the workspace still did not appear", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "declared", file: "naptime", label: "naptime" },
      spreadAvailable: true,
      spreadAttempted: true,
    });

    expect(out).toContain("naptime");
    expect(out).toContain("did not");
  });

  test("says there is no layout at all, and where layouts live", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "absent" },
      spreadAvailable: true,
    });

    expect(out).toContain("no layout");
    expect(out).toContain("~/.herdr-spreader");
  });

  test("does not suggest spread when there is no layout to apply", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "absent" },
      spreadAvailable: true,
    });

    expect(out).not.toContain("spread naptime");
  });

  test("admits when the layout directory could not be read", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "unknown" },
      spreadAvailable: true,
    });

    expect(out).toContain("could not be read");
  });

  test("always names the project it was looking for", () => {
    const out = formatNoMatch(ROOT, {
      layout: { kind: "absent" },
      spreadAvailable: true,
    });

    expect(out).toContain(ROOT);
  });
});
