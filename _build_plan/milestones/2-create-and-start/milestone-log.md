# Milestone 2 — Create and start

## What's new in the app

- **It actually opens the session now.** One command creates a new focused tab in the right
  workspace and leaves Claude running in it, ready to type into. Takes about four seconds.
- **It brings up a missing workspace for you.** If nothing is open for the project, it finds
  the matching layout and applies it with `spread`, then carries on.
- **It knows about all your layouts.** Milestone 1 could only see one; it now reads every
  layout in `~/.herdr-spreader/`, so it gives the right answer for every project.
- **A failure never leaves you guessing.** If the tab is made but Claude does not start, the
  tab stays open at a shell prompt in the right directory and you are told exactly what went
  wrong and how to look into it.
- **`--dry-run` still changes nothing**, and refusing an ambiguous project still blocks
  creation rather than guessing.

## What was built

- `src/spreader/layout.ts` — rewritten: `parseLayouts` + `layoutStatusFor` over the layout
  *directory*, returning the layout filename (`spread`'s argument) and workspace label.
- `src/herdr/create.ts` — `tabCreateArgs`, `agentStartArgs` (with timeout clamping),
  `parseTabCreated`, `parseAgentStarted`, `isShellNotReady`.
- `src/system.ts` — `readLayoutFiles`, `spreadAvailable`, `runSpread`, `createTab`,
  `startAgent` (with the shell-readiness retry), `closeTab`.
- `src/cli/output.ts` — `formatCreated`, `formatAgentFailed`; `formatNoMatch` rewritten to
  distinguish four situations and name a concrete command.
- `index.ts` — `resolveOrSpread` (resolve, apply layout, retry once) and `create`.
- `scripts/check-live.ts` + `bun run check:live` — opt-in integration check.
- 105 tests (up from 69), all still free of mutation.

## Decisions made that the PRD did not pre-specify

1. **The fallback shells out to `spread`, not to herdr-spreader directly.** `herdr-spreader
   apply` has no per-workspace targeting — it applies whatever config it finds — so calling it
   directly would build every declared workspace. `~/.bin/spread` already solves this: it takes
   a layout name, re-points the plugin's `config.yaml` symlink, and **focuses an already-open
   workspace instead of building a second copy** with duplicate dev servers. Reimplementing any
   of that would have been strictly worse.

2. **`spread` is checked only on the fallback path.** Its absence is irrelevant when a
   workspace already exists, so it is never a startup requirement.

3. **`startAgent` retries the shell-readiness rejection.** See below — this was a live finding,
   not a design choice made in advance.

4. **`closeTab` was added** for `check-live.ts` to clean up after itself. Teardown proper is
   still milestone 5; this is just the primitive.

## Bug fixed from milestone 1

`layoutStatusFor` read `~/.config/herdr/plugins/config/herdr-spreader/config.yaml`. That path
is a **symlink `spread` re-points at whichever layout was applied last**. The real layouts are
15 files in `~/.herdr-spreader/`, one workspace each.

Milestone 1 therefore answered correctly for exactly one project and wrongly for the other 14.
Demonstrated live in `~/src/naptime`, which `naptime.yml` declares by exactly that root: the
old build said *"herdr-spreader has no layout for this project either."* It now says the layout
is `naptime` and offers `spread naptime`.

The bug was invisible because the only project tested (`~/src/herdr-tab-new`) genuinely has no
layout, so a wrong answer looked right.

## Things milestone 3 needs to know

- **`tab create` returns a pane before that pane's shell has reached an interactive prompt.**
  An immediate `agent start` is rejected with *"agent target pane w2:p2 is not an available
  shell"*, and herdr's `--timeout` does **not** cover this — it covers agent readiness after
  launch. `startAgent` polls every 250ms for up to 10s, retrying only that specific message
  (`isShellNotReady`), so a genuinely bad request still fails immediately. Anything that
  creates a pane and then starts something in it must account for this.
- **`agent.start` requires `timeout_ms` above 3000 and at most 300000.** `agentStartArgs`
  clamps; the default is 60s, which is comfortable for Claude's startup.
- **`tab.create` returns `{ tab, root_pane }`** — the pane comes back, so nothing needs polling
  to find it.
- **The agent's `name` is what shows in herdr's agent panel**, and is set to the tab label so
  the two views agree. Milestone 3's `--kind` must keep passing a name.
- **`herdr tab close <tab_id>` returns `{"type":"ok"}`** and is what milestone 5 will use.
- **`bun run check:live` is the pattern for testing mutations** — create, assert, always clean
  up in a `finally`. Milestone 3 should extend it rather than adding mutation to `bun test`.
- **The live ambiguity is still present** (`hrock` w5 and `hamilton_rock` w8 both at
  `/Users/andrew/hrock/src/hamilton_rock`). Note `hrock.yml` declares `name: hrock` at that
  root, which is where w5's label comes from; w8 appears to have been made by hand.

## Deviations from the PRD

- The PRD said the fallback would call herdr-spreader; it calls `spread`, for the reason above.
  The PRD's milestone 2 card has been updated to match.
- Nothing else. Scope is as specified: no other agent kinds, no state file, no worktrees, no
  teardown, no seed prompt.

## Verification performed

- `bun test` — 105 pass, 0 fail. `bunx tsc --noEmit` — exit 0.
- **Bug fix proof:** `~/src/naptime` now reports the `naptime` layout and offers
  `spread naptime`; `~/src/herdr-tab-new` still correctly reports no layout at all (exit 3).
- **Real creation:** in `~/hrock/src/compliance`, `herdr-tab-new m2-smoke-test` created tab
  `w2:t4` with Claude running in the correct directory. Confirmed independently via
  `herdr agent list` (name `m2-smoke-test`, kind claude, status idle, pane `w2:p4`) and
  `herdr tab list --workspace w2`. Tab closed afterwards; w2 back to one tab.
- **Partial failure path exercised for real** — the first attempt hit the shell race and
  produced exactly the intended output: tab left open, herdr's own reason quoted, exit 2.
- `bun run check:live` — 8 assertions pass, workspace returned to its original tabs.
- `--dry-run` in `~/hrock/src/compliance` — w2 tab count unchanged (1 → 1).
- Ambiguity in `~/hrock/src/hamilton_rock` — exit 4, no tab created in w5 or w8.
- Compiled binary run with `PATH` containing only `git` and `herdr` — worked identically.

### Not verified live

**The `spread` fallback has not been exercised end to end.** Its decision logic is unit-tested
and the "which layout" half is proven live, but actually running `spread` would create a
workspace and start that project's dev servers (every layout runs `zed .` plus a dev server or
log tails), so it was left for Andrew to trigger deliberately. Milestone 3 should not assume
this path has been observed working.
