import { describe, expect, test } from "bun:test";
import { focusArgs } from "../../src/plugin/focus.ts";
import { parseHerdrResponse } from "../../src/herdr/client.ts";
import type { Pane } from "../../src/herdr/types.ts";

const livePanes = async (): Promise<Pane[]> => {
  const text = await Bun.file(
    new URL("../fixtures/panes.json", import.meta.url),
  ).text();
  return (parseHerdrResponse(text) as { panes: Pane[] }).panes;
};

describe("focusArgs", () => {
  test("focuses the workspace before the tab inside it", async () => {
    // Two calls, in this order: `tab focus` alone cannot be relied on to pull
    // the workspace forward, and focusing the workspace first is idempotent.
    expect(focusArgs(await livePanes(), "w2:p1")).toEqual([
      ["workspace", "focus", "w2"],
      ["tab", "focus", "w2:t1"],
    ]);
  });

  test("reads the tab from the pane rather than guessing it from the id", async () => {
    // "w4:p1" looks like it implies "w4:t1", and here it happens to. Deriving
    // it that way would be wrong the moment a tab holds a second pane, so the
    // tab is taken from the pane record.
    const panes = await livePanes();
    const target = panes.find((p) => p.pane_id === "w4:p1")!;

    expect(focusArgs(panes, "w4:p1")).toEqual([
      ["workspace", "focus", target.workspace_id],
      ["tab", "focus", target.tab_id],
    ]);
  });

  test("is null for a pane that has closed since it was listed", async () => {
    // The session could go away between listing and choosing. Focusing nothing
    // has to be distinguishable from focusing something, or the caller reports
    // success for a no-op.
    expect(focusArgs(await livePanes(), "w9:p9")).toBeNull();
  });
});
