import { describe, expect, test } from "bun:test";
import { paneOpenArgs } from "../../src/plugin/pane-open.ts";

describe("paneOpenArgs", () => {
  test("names the plugin, the entrypoint, and the project it decided on", () => {
    expect(
      paneOpenArgs({
        pluginId: "softwarecrafts.tab-new",
        entrypoint: "picker",
        projectRoot: "/Users/andrew/src/compliance",
      }),
    ).toEqual([
      "plugin",
      "pane",
      "open",
      "--plugin",
      "softwarecrafts.tab-new",
      "--entrypoint",
      "picker",
      "--cwd",
      "/Users/andrew/src/compliance",
      "--env",
      "HERDR_TAB_NEW_PROJECT=/Users/andrew/src/compliance",
    ]);
  });

  test("passes no --placement, so the manifest's popup wins", () => {
    // `plugin pane open --placement` accepts only overlay|split|tab|zoomed on
    // 0.8.2. Naming any of them here would silently downgrade the popup to a
    // tiled pane — and the popup is the only placement that gets terminal input.
    const args = paneOpenArgs({
      pluginId: "softwarecrafts.tab-new",
      entrypoint: "picker",
      projectRoot: "/tmp/x",
    });

    expect(args).not.toContain("--placement");
  });
});
