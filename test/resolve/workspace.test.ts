import { describe, expect, test } from "bun:test";
import {
  AmbiguousWorkspaceError,
  chooseWorkspace,
  matchWorkspaces,
  NoWorkspaceMatchError,
  UnknownWorkspaceError,
} from "../../src/resolve/workspace.ts";
import { parseHerdrResponse } from "../../src/herdr/client.ts";
import type { Pane, Workspace } from "../../src/herdr/types.ts";

const fixture = async (name: string) => {
  const text = await Bun.file(
    new URL(`../fixtures/${name}`, import.meta.url),
  ).text();
  return parseHerdrResponse(text);
};

const livePanes = async (): Promise<Pane[]> =>
  ((await fixture("panes.json")) as { panes: Pane[] }).panes;

const liveWorkspaces = async (): Promise<Workspace[]> =>
  ((await fixture("workspaces.json")) as { workspaces: Workspace[] }).workspaces;

const pane = (workspace_id: string, cwd: string): Pane =>
  ({ workspace_id, cwd }) as Pane;

const workspace = (
  workspace_id: string,
  label: string,
  focused = false,
): Workspace => ({ workspace_id, label, focused }) as Workspace;

describe("matchWorkspaces", () => {
  test("matches a pane sitting exactly at the project root", () => {
    const panes = [pane("w2", "/Users/andrew/hrock/src/compliance")];

    expect(matchWorkspaces(panes, "/Users/andrew/hrock/src/compliance")).toEqual(
      ["w2"],
    );
  });

  test("matches a pane sitting beneath the project root", () => {
    const panes = [pane("w2", "/Users/andrew/hrock/src/compliance/app/models")];

    expect(matchWorkspaces(panes, "/Users/andrew/hrock/src/compliance")).toEqual(
      ["w2"],
    );
  });

  test("never matches a pane sitting above the project root", () => {
    const panes = [pane("w4", "/Users/andrew")];

    expect(matchWorkspaces(panes, "/Users/andrew/hrock/src/compliance")).toEqual(
      [],
    );
  });

  test("does not treat a sibling with a shared prefix as inside", () => {
    const panes = [pane("w9", "/Users/andrew/hrock-old")];

    expect(matchWorkspaces(panes, "/Users/andrew/hrock")).toEqual([]);
  });

  test("returns each workspace once however many panes match", async () => {
    const panes = await livePanes();

    const matched = matchWorkspaces(
      panes,
      "/Users/andrew/hrock/src/hamilton_rock",
    );

    expect(matched.filter((id) => id === "w5")).toHaveLength(1);
  });

  test("finds the real hrock/hamilton_rock ambiguity in the live fixture", async () => {
    const panes = await livePanes();

    const matched = matchWorkspaces(
      panes,
      "/Users/andrew/hrock/src/hamilton_rock",
    );

    expect(matched.sort()).toEqual(["w5", "w8"]);
  });

  test("does not match the home workspace for a nested project", async () => {
    const panes = await livePanes();

    const matched = matchWorkspaces(panes, "/Users/andrew/hrock/src/compliance");

    expect(matched).toEqual(["w2"]);
  });
});

describe("chooseWorkspace", () => {
  test("takes the only candidate", async () => {
    const workspaces = await liveWorkspaces();

    expect(chooseWorkspace(["w2"], workspaces).workspace_id).toBe("w2");
  });

  test("prefers the focused workspace when several match", () => {
    const workspaces = [
      workspace("w5", "hrock"),
      workspace("w8", "hamilton_rock", true),
    ];

    expect(chooseWorkspace(["w5", "w8"], workspaces).workspace_id).toBe("w8");
  });

  test("refuses to guess when several match and none is focused", () => {
    const workspaces = [workspace("w5", "hrock"), workspace("w8", "hamilton_rock")];

    expect(() => chooseWorkspace(["w5", "w8"], workspaces)).toThrow(
      AmbiguousWorkspaceError,
    );
  });

  test("names both candidates when it refuses", () => {
    const workspaces = [workspace("w5", "hrock"), workspace("w8", "hamilton_rock")];

    try {
      chooseWorkspace(["w5", "w8"], workspaces);
      throw new Error("expected chooseWorkspace to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(AmbiguousWorkspaceError);
      const candidates = (err as AmbiguousWorkspaceError).candidates.map(
        (w) => w.label,
      );
      expect(candidates.sort()).toEqual(["hamilton_rock", "hrock"]);
    }
  });

  test("fails when nothing matched", async () => {
    const workspaces = await liveWorkspaces();

    expect(() => chooseWorkspace([], workspaces)).toThrow(NoWorkspaceMatchError);
  });

  test("an explicit workspace id overrides matching entirely", async () => {
    const workspaces = await liveWorkspaces();

    expect(chooseWorkspace([], workspaces, "w8").workspace_id).toBe("w8");
  });

  test("an explicit workspace label overrides matching entirely", async () => {
    const workspaces = await liveWorkspaces();

    expect(chooseWorkspace([], workspaces, "compliance").workspace_id).toBe(
      "w2",
    );
  });

  test("rejects an explicit workspace that does not exist", async () => {
    const workspaces = await liveWorkspaces();

    expect(() => chooseWorkspace(["w2"], workspaces, "nope")).toThrow(
      UnknownWorkspaceError,
    );
  });
});
