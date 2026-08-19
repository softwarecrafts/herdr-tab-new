# Milestone 5 — Teardown

## What's new in the app

- **`--teardown` clears away the sessions this tool made** — all of them, or just one by name.
- **`--teardown --dry-run` shows you first.** It lists exactly what would be closed, removed,
  skipped and forgotten, and changes nothing.
- **A worktree with unsaved work is never removed.** It is skipped, the reason is stated, and
  the work is left exactly where it was.
- **It only ever touches what it created.** A tab you opened yourself is invisible to teardown,
  whatever it is called.
- **Branches survive**, and the summary says so, so nothing looks like it vanished.
- **Records for tabs you already closed are quietly forgotten.**

## What was built

- `src/state/teardown.ts` — `planTeardown`, a pure classification of what to close, remove,
  skip, forget and keep. Every safety property is decided here and testable without herdr or git.
- `src/state/record.ts` — `serializeRecords`.
- `src/system.ts` — `writeRecords` (temp file + rename), `isWorktreeDirty`; `removeWorktree`
  gained a `force` parameter defaulting to **false**.
- `src/cli/output.ts` — `formatTeardownPlan`, `formatTeardownResult`.
- `index.ts` — `--teardown`, the only place records are removed.
- `scripts/check-live.ts` — asserts against a real worktree that teardown refuses uncommitted
  work and keeps its record.
- 208 tests (up from 177), still no mutation in `bun test`.

## Decisions made that the PRD did not pre-specify

1. **Dirtiness is judged here, not inferred from herdr.** herdr's schema has no error code for a
   dirty worktree, so its refusal would arrive as free text — and milestone 2 already showed
   message-matching to be fragile. `git status --porcelain` is authoritative, lets the summary
   say *what* is wrong, and means the decision is made before calling herdr rather than
   interpreting it afterwards. `removeWorktree` is then called **without** `--force`, so herdr's
   own refusal remains a second line of defence rather than something already overridden.

2. **A skipped worktree keeps its record.** Not in the PRD, and load-bearing: pruning it would
   strand the worktree with nothing remembering it existed, so it could never be cleaned up.

3. **Untracked files count as dirty**, matching git's own `worktree remove`. An uncommitted new
   file an agent just wrote is exactly the work worth protecting.

4. **In teardown mode the positional argument means "which session".** `--teardown m5-alpha`
   rather than a separate `--only` flag; the mode makes it unambiguous. It matches a label or a
   tab id.

5. **One failure does not abandon the rest.** Each close/remove is attempted independently, and
   a record is only forgotten once the thing it describes is actually gone — a failed removal
   keeps its record and is reported as skipped.

## The one place this tool is not append-only

Pruning rewrites the record file via a temp file and a rename. That is atomic at the filesystem
level, but a record appended between the read and the rename is lost. The window is milliseconds
during a command run deliberately, and it is stated in `writeRecords` rather than glossed — it
is also why every other write in the tool is an append.

## Deviations from the PRD

None in behaviour. The PRD's milestone 5 asked for a teardown command, worktrees removed with
their tab, dirty worktrees left alone and reported, a preview mode, stale records cleared, and a
summary — all present. Out-of-scope items are respected: no tabs it did not create, no
workspaces closed for their own sake, no branches deleted, no automatic cleanup.

Note that removing a worktree session does remove its herdr *workspace*, because in milestone 4
a worktree session **is** a workspace. That is not the PRD's "closing whole workspaces", which
meant closing arbitrary ones.

## Verification performed

- `bun run check` — 208 tests pass, `tsc --noEmit` exit 0.
- **Preview touches nothing:** with two sessions and a hand-made tab open, `--teardown
  --dry-run` listed only the two recorded sessions; `herdr tab list` and the state file were
  md5-identical before and after.
- **Only its own tabs:** the preview and every teardown ignored `handmade` (`w2:tD`), created
  directly with `herdr tab create`, and the three pre-existing tabs.
- **Targeted teardown is surgical:** `--teardown m5-alpha` closed that one; `m5-beta` and
  `handmade` were still open afterwards.
- **The important one — a dirty worktree is refused:** a worktree session with an untracked
  `UNCOMMITTED.txt` was skipped with the reason while a clean tab session was closed in the same
  run. The file was still there afterwards, with its contents intact, and the worktree still in
  `git worktree list`. Its record was kept, confirmed via `--list`.
- **Clean removal works:** deleting that file and re-running removed the worktree, and
  `git branch --list m5-dirty` confirmed the branch survived exactly as the summary promised.
- **Stale records are pruned quietly:** a recorded tab closed by hand was reported as
  `1 stale record(s) forgotten`, with no herdr call for it.
- `bun run check:live:worktree` — 13 assertions pass, including the three new teardown safety
  ones, against a real worktree.
- Afterwards: tabs, workspaces, `git worktree list`, branch and the 11 uncommitted files in
  `~/hrock/src/compliance` all back to their starting state; test branches and state removed.

## The PRD is now complete

All five milestones are built. `herdr-tab-new` resolves the workspace for a project, creates a
focused tab with an agent in it, brings a missing workspace up via `spread`, supports agent
kinds other than Claude, records what it created, isolates work in a git worktree on request,
and clears up after itself.

Anything further is new scope. The items the PRD parked, in the order they were closest to
being wanted: **auto-firing** without being asked (which is where a herdr plugin becomes the
right shape, invoking this binary from a `[[events]]` hook), a **seed prompt** for the new
session, and **listing across all sessions at once**.
