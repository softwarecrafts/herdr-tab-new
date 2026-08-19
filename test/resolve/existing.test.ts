import { describe, expect, test } from "bun:test";
import {
  groupByProject,
  matchExistingSessions,
} from "../../src/resolve/existing.ts";
import type { AgentInfo, Tab } from "../../src/herdr/types.ts";
import type { TabRecord } from "../../src/state/record.ts";

const agent = (over: Partial<AgentInfo> = {}): AgentInfo =>
  ({
    agent: "claude",
    agent_status: "idle",
    cwd: "/Users/andrew/hrock/src/compliance",
    pane_id: "w2:p2",
    tab_id: "w2:t2",
    workspace_id: "w2",
    ...over,
  }) as AgentInfo;

const tab = (over: Partial<Tab> = {}): Tab =>
  ({ tab_id: "w2:t2", workspace_id: "w2", label: "compliance", ...over }) as Tab;

const record = (over: Partial<TabRecord> = {}): TabRecord => ({
  session: "default",
  workspaceId: "w2",
  workspaceLabel: "compliance",
  tabId: "w2:t2",
  label: "compliance",
  directory: "/Users/andrew/hrock/src/compliance",
  agentKind: "claude",
  agentStarted: true,
  worktree: null,
  created: "2026-08-19T08:00:00.000Z",
  ...over,
});

describe("matchExistingSessions", () => {
  test("finds a live agent sitting in this project", () => {
    const found = matchExistingSessions({
      agents: [agent()],
      tabs: [tab()],
      records: [record()],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.paneId).toBe("w2:p2");
  });

  test("ignores agents working in other projects", () => {
    const found = matchExistingSessions({
      agents: [agent({ cwd: "/Users/andrew/src/naptime" })],
      tabs: [tab()],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found).toEqual([]);
  });

  test("does not match a directory merely beneath the project", () => {
    // A worktree session has its own root, and should stay a separate session.
    const found = matchExistingSessions({
      agents: [agent({ cwd: "/Users/andrew/hrock/src/compliance/app" })],
      tabs: [tab()],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found).toEqual([]);
  });

  test("finds a session this tool never created", () => {
    // herdr's live view is authoritative: a tab you made by hand, or one whose
    // record teardown pruned, is exactly what you have lost track of.
    const found = matchExistingSessions({
      agents: [agent()],
      tabs: [tab()],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.created).toBeNull();
  });

  test("takes the age from our record when we have one", () => {
    const found = matchExistingSessions({
      agents: [agent()],
      tabs: [tab()],
      records: [record()],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found[0]?.created).toBe("2026-08-19T08:00:00.000Z");
  });

  test("takes the name from herdr's tab, not from our record", () => {
    // herdr is the live truth; a record could be stale if the tab was renamed.
    const found = matchExistingSessions({
      agents: [agent()],
      tabs: [tab({ label: "renamed-in-herdr" })],
      records: [record({ label: "stale-name" })],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found[0]?.label).toBe("renamed-in-herdr");
  });

  test("survives a missing tab entry", () => {
    const found = matchExistingSessions({
      agents: [agent()],
      tabs: [],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found).toHaveLength(1);
    expect(found[0]?.label).toBeNull();
  });

  test("carries the status through, which is the only liveness signal there is", () => {
    const found = matchExistingSessions({
      agents: [agent({ agent_status: "working" })],
      tabs: [tab()],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found[0]?.status).toBe("working");
  });

  test("finds several sessions on the same project", () => {
    const found = matchExistingSessions({
      agents: [
        agent({ pane_id: "w2:p2", tab_id: "w2:t2" }),
        agent({ pane_id: "w2:p3", tab_id: "w2:t3" }),
      ],
      tabs: [tab(), tab({ tab_id: "w2:t3", label: "second" })],
      records: [],
      projectRoot: "/Users/andrew/hrock/src/compliance",
    });

    expect(found.map((s) => s.paneId)).toEqual(["w2:p2", "w2:p3"]);
  });
});

describe("groupByProject", () => {
  test("groups live agents by the directory they are working in", () => {
    const groups = groupByProject({
      agents: [
        agent({ cwd: "/a", pane_id: "w1:p1", tab_id: "w1:t1" }),
        agent({ cwd: "/b", pane_id: "w2:p1", tab_id: "w2:t1" }),
        agent({ cwd: "/a", pane_id: "w3:p1", tab_id: "w3:t1" }),
      ],
      tabs: [],
      records: [],
    });

    expect(groups.map((g) => g.projectRoot)).toEqual(["/a", "/b"]);
    expect(groups[0]?.sessions).toHaveLength(2);
  });

  test("puts the projects with most sessions first", () => {
    const groups = groupByProject({
      agents: [
        agent({ cwd: "/one", pane_id: "w1:p1", tab_id: "w1:t1" }),
        agent({ cwd: "/many", pane_id: "w2:p1", tab_id: "w2:t1" }),
        agent({ cwd: "/many", pane_id: "w3:p1", tab_id: "w3:t1" }),
      ],
      tabs: [],
      records: [],
    });

    expect(groups[0]?.projectRoot).toBe("/many");
  });

  test("returns nothing when no agents are live", () => {
    expect(groupByProject({ agents: [], tabs: [], records: [] })).toEqual([]);
  });
});
