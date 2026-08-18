import { describe, expect, test } from "bun:test";
import { layoutStatusFor } from "../../src/spreader/layout.ts";

const HOME = "/Users/andrew";

const config = `
workspaces:
  - name: addidat
    root: ~/freelancing/addidat/src/addidat-web
    tabs:
      - label: addidat
        panes:
          - command: just dev; zed .
  - name: absolute
    root: /opt/projects/thing/
`;

describe("layoutStatusFor", () => {
  test("finds a layout declared with a ~ path", () => {
    const status = layoutStatusFor(
      config,
      "/Users/andrew/freelancing/addidat/src/addidat-web",
      HOME,
    );

    expect(status).toEqual({ kind: "declared", name: "addidat" });
  });

  test("finds a layout declared with an absolute path, ignoring a trailing slash", () => {
    const status = layoutStatusFor(config, "/opt/projects/thing", HOME);

    expect(status).toEqual({ kind: "declared", name: "absolute" });
  });

  test("reports absent for a project with no layout", () => {
    const status = layoutStatusFor(config, "/Users/andrew/src/herdr-tab-new", HOME);

    expect(status.kind).toBe("absent");
  });

  test("reports unknown when there is no config at all", () => {
    const status = layoutStatusFor(null, "/Users/andrew/anything", HOME);

    expect(status.kind).toBe("unknown");
  });

  test("reports unknown rather than throwing on malformed YAML", () => {
    const status = layoutStatusFor("workspaces: [oops", "/Users/andrew", HOME);

    expect(status.kind).toBe("unknown");
  });

  test("reports unknown when the config has no workspaces list", () => {
    const status = layoutStatusFor("something_else: true", "/Users/andrew", HOME);

    expect(status.kind).toBe("unknown");
  });
});
