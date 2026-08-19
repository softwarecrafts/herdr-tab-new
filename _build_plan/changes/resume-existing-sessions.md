# Resume an existing session instead of duplicating it

A change on top of the completed PRD.

## The problem

The tool only ever created. Closing the terminal you attached from leaves the tab and its agent
running in the herdr server — correct, but invisible. Running the command again in the same
project made a *second* session, so sessions accumulated server-side and the work you meant to
pick back up became the hardest thing to find.

## What changed

If any live agent is working in this project's directory, you are shown what exists and choose
between resuming one and starting another. `--new` skips the picker; `--attach` lists every live
session grouped by project.

## What herdr does and does not know

`herdr agent list` gives `cwd`, `pane_id`, `tab_id`, `agent_status` and the agent's own
conversation id, so "does a session already exist here?" needed no new bookkeeping — and works
for sessions this tool never created.

Two things it does not give, both of which shaped the result:

- **Whether a client is attached to a pane.** `AgentInfo` has no such field; the
  `no_foreground_client` in the schema is only a reason code for window-title and notification
  calls. So the picker cannot filter to "unattached" sessions and shows `agent_status` instead.
- **When an agent started.** There is no timestamp on an agent, only `revision` and
  `state_change_seq`. Ages therefore come from this tool's own records, joined on `tabId`, and a
  session it did not create shows no age rather than a fabricated one.

## Decisions

- **A match is any live agent whose cwd is exactly the project root.** Not "beneath" it — a
  worktree session has its own root and stays a separate session.
- **The picker always appears when anything matches**, even a single session, so you see what
  exists before anything happens.
- **herdr's tab supplies the name, not our record** — a record goes stale if the tab is renamed.
- **`parseChoice` rejects rather than coerces.** `parseInt("1x")` is 1, so accepting it would
  attach you to the first session because of a typo. Out-of-range input is rejected rather than
  clamped, for the same reason.
- **Exit code 5** when a choice is needed but stdin is not a terminal — printed and stopped,
  never guessed at, never hung.

## Verified

- `bun run check` — 278 tests, `tsc --noEmit` exit 0.
- **The common path does not regress:** in a project with nothing running, it goes straight to
  creating with no prompt.
- **The core case:** with a session already open, a second run listed it — `idle · resume-probe
  · just now` — and created nothing. Tab count confirmed unchanged.
- **`--new`** skipped the picker and created.
- **`--attach`** grouped four live sessions across three projects, busiest project first.
- **Sessions this tool never created are found**, and correctly show no age — confirmed against
  a running agent with no record.
- **The non-terminal path prints and exits 5** rather than hanging.

## Not verified

**The prompt itself**, which needs a real terminal — every shell available here is
non-interactive, which is exactly the path that prints and exits. Andrew should confirm that
choosing a number lands him in that session and that `n` creates a new one.
