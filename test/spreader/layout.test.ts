import { describe, expect, test } from "bun:test";
import {
  type LayoutFile,
  layoutStatusFor,
  parseLayouts,
} from "../../src/spreader/layout.ts";

const HOME = "/Users/andrew";

const files: LayoutFile[] = [
  {
    file: "naptime",
    text: `
workspaces:
  - name: naptime
    root: ~/src/naptime
    tabs:
      - label: naptime
`,
  },
  {
    file: "hrock",
    text: `
workspaces:
  - name: hrock
    root: ~/hrock/src/hamilton_rock
`,
  },
  {
    file: "absolute-thing",
    text: `
workspaces:
  - name: thing
    root: /opt/projects/thing/
`,
  },
];

describe("parseLayouts", () => {
  test("reads one workspace per file, keyed by filename", () => {
    // `spread` takes the FILE name, so that is what we have to report back —
    // the `name:` inside is the workspace label herdr will show.
    const layouts = parseLayouts(files, HOME);

    expect(layouts.map((l) => l.file).sort()).toEqual([
      "absolute-thing",
      "hrock",
      "naptime",
    ]);
  });

  test("expands ~ in a declared root", () => {
    const layouts = parseLayouts(files, HOME);

    expect(layouts.find((l) => l.file === "naptime")?.root).toBe(
      "/Users/andrew/src/naptime",
    );
  });

  test("keeps the workspace label separately from the filename", () => {
    const layouts = parseLayouts(files, HOME);
    const found = layouts.find((l) => l.file === "absolute-thing");

    expect(found?.label).toBe("thing");
    expect(found?.root).toBe("/opt/projects/thing");
  });

  test("skips a malformed file without losing the good ones", () => {
    const layouts = parseLayouts(
      [...files, { file: "broken", text: "workspaces: [oops" }],
      HOME,
    );

    expect(layouts.map((l) => l.file)).toContain("naptime");
    expect(layouts.map((l) => l.file)).not.toContain("broken");
  });
});

describe("layoutStatusFor", () => {
  test("finds the layout for a project, by root", () => {
    // Regression: milestone 1 read the plugin's config.yaml, which is a symlink
    // to whichever layout was applied last — so it reported "no layout" for
    // every project except that one.
    const status = layoutStatusFor(
      parseLayouts(files, HOME),
      "/Users/andrew/src/naptime",
    );

    expect(status).toEqual({ kind: "declared", file: "naptime", label: "naptime" });
  });

  test("matches a root declared absolutely, trailing slash and all", () => {
    const status = layoutStatusFor(parseLayouts(files, HOME), "/opt/projects/thing");

    expect(status.kind).toBe("declared");
  });

  test("reports absent for a project with no layout anywhere", () => {
    const status = layoutStatusFor(
      parseLayouts(files, HOME),
      "/Users/andrew/src/herdr-tab-new",
    );

    expect(status.kind).toBe("absent");
  });

  test("reports unknown when the layout directory could not be read", () => {
    expect(layoutStatusFor(null, "/Users/andrew/src/naptime").kind).toBe(
      "unknown",
    );
  });

  test("does not match a project merely beneath a declared root", () => {
    // A layout for ~/src/naptime is not a layout for ~/src/naptime/www.
    const status = layoutStatusFor(
      parseLayouts(files, HOME),
      "/Users/andrew/src/naptime/www",
    );

    expect(status.kind).toBe("absent");
  });
});
