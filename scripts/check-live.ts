#!/usr/bin/env bun
/**
 * Opt-in integration check. Unlike `bun test`, this touches your live herdr: it
 * creates a real tab, starts a real Claude session in it, asserts both exist,
 * then closes the tab again.
 *
 * It is deliberately NOT part of `bun test`, so a routine test run — including
 * one an agent kicks off — can never create tabs.
 *
 *   bun run check:live
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveSocket } from "../src/resolve/socket.ts";
import {
  appendRecord,
  closeTab,
  createTab,
  listAllTabs,
  listSessions,
  listTabs,
  readRecords,
  runHerdr,
  startAgent,
} from "../src/system.ts";
import { annotateLiveness } from "../src/state/record.ts";
import type { AgentInfo, Workspace } from "../src/herdr/types.ts";

const LABEL = `check-live-${process.pid}`;

// Records go to a throwaway file so a live check never adds cruft to the real
// session's state.
const stateDir = mkdtempSync(join(tmpdir(), "herdr-tab-new-check-"));
process.env.HERDR_TAB_NEW_STATE = join(stateDir, "tabs.jsonl");

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
  console.log(`  ok  ${message}`);
}

function main(): number {
  const { socketPath, sessionName } = resolveSocket(process.env, listSessions());
  console.log(`Live check against session "${sessionName}"`);

  const workspaces = (
    runHerdr(["workspace", "list"], socketPath) as { workspaces: Workspace[] }
  ).workspaces;

  const target = workspaces.find((w) => w.focused) ?? workspaces[0];
  if (!target) {
    console.error("no herdr workspace to test against — start one first");
    return 1;
  }

  console.log(`Using workspace ${target.label} (${target.workspace_id})\n`);

  const before = listTabs(socketPath, target.workspace_id).length;
  const { tab, rootPane } = createTab(socketPath, {
    workspaceId: target.workspace_id,
    cwd: process.cwd(),
    label: LABEL,
  });

  try {
    assert(tab.tab_id.startsWith(target.workspace_id), "tab is in the workspace");
    assert(Boolean(rootPane.pane_id), "herdr returned a pane to start an agent in");

    const labels = listTabs(socketPath, target.workspace_id).map((t) => t.label);
    assert(labels.includes(LABEL), `tab "${LABEL}" is listed`);
    assert(
      listTabs(socketPath, target.workspace_id).length === before + 1,
      "exactly one tab was added",
    );

    // The interesting part: herdr hands back the pane before its shell reaches
    // a prompt, so startAgent has to wait that gap out.
    startAgent(socketPath, {
      name: LABEL,
      kind: "claude",
      paneId: rootPane.pane_id,
    });

    const agents = (
      runHerdr(["agent", "list"], socketPath) as { agents: AgentInfo[] }
    ).agents;
    const started = agents.find((a) => a.pane_id === rootPane.pane_id);

    assert(started !== undefined, "an agent is running in the new pane");
    assert(started?.agent === "claude", "the agent is claude");

    appendRecord(socketPath, {
      session: sessionName,
      workspaceId: target.workspace_id,
      workspaceLabel: target.label,
      tabId: tab.tab_id,
      label: LABEL,
      directory: process.cwd(),
      agentKind: "claude",
      agentStarted: true,
      worktree: null,
      created: new Date().toISOString(),
    });

    const recorded = readRecords(socketPath);
    assert(
      recorded.some((r) => r.tabId === tab.tab_id),
      "the tab was recorded",
    );
    assert(
      annotateLiveness(recorded, listAllTabs(socketPath).map((t) => t.tab_id))
        .find((r) => r.tabId === tab.tab_id)?.live === true,
      "the record reads as live while the tab exists",
    );
  } finally {
    closeTab(socketPath, tab.tab_id);
    const after = listTabs(socketPath, target.workspace_id).map((t) => t.label);
    assert(!after.includes(LABEL), "the tab was cleaned up");
    assert(after.length === before, "the workspace is back to its original tabs");

    const live = listAllTabs(socketPath).map((t) => t.tab_id);
    const stale = annotateLiveness(readRecords(socketPath), live).find(
      (r) => r.tabId === tab.tab_id,
    );
    assert(
      stale !== undefined && !stale.live,
      "the record reads as gone once the tab is closed",
    );

    rmSync(stateDir, { recursive: true, force: true });
  }

  console.log("\nLive check passed.");
  return 0;
}

process.exit(main());
