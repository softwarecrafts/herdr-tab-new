# Milestone 3 — Agent kinds and records

## What's new in the app

- **Claude is no longer the only option.** `--kind codex` (or any agent your herdr supports)
  starts that agent instead.
- **A typo costs you nothing.** An unknown agent name is rejected *before* anything is created,
  and the message lists exactly what your herdr supports — so you never end up with a stray tab.
- **It remembers what it made.** Every tab it creates is recorded, including ones where the
  agent failed to start.
- **`--list` shows your sessions**, newest first, marking any whose tab has since been closed
  and flagging any that never got an agent.
- **Two runs at once can't tread on each other.** Records from simultaneous invocations both
  survive — verified live.
- **Sessions stay separate.** Records for the `hamilton` session never show up in the default
  session's listing.

## What was built

- `src/agent/kinds.ts` — `parseAgentKinds` (reads `[possible values: …]` from herdr's own
  help), `FALLBACK_KINDS`, `assertKnownKind`, `DEFAULT_KIND`.
- `src/state/record.ts` — `TabRecord`, `stateFileFor` (with `HERDR_TAB_NEW_STATE` override),
  `toRecordLine`, `parseRecords`, `annotateLiveness`.
- `src/system.ts` — `agentKinds()`, `listAllTabs()`, `appendRecord()`, `readRecords()`.
- `src/cli/output.ts` — `formatList`.
- `index.ts` — `--kind` (validated before creation), `--list`, record written on both the
  success and agent-failure paths.
- `scripts/check-live.ts` — extended to assert a record is written, reads live while the tab
  exists, and reads gone once it is closed. Writes to a temp file, so a live check never adds
  cruft to real state.
- 141 tests (up from 105), still no mutation in `bun test`.

## Decisions made that the PRD did not pre-specify

1. **Agent kinds are read from `herdr agent start --help` at runtime.** herdr's API schema
   types `kind` as a plain `string`, so it cannot validate. The schema *does* contain an
   `IntegrationTarget` enum with 16 values — **this is not the agent-kind list** (it is for
   `herdr integration install`, includes `antigravity_cli`, and omits `gemini`, `agy`, `cline`,
   `kiro`, `amp`, `maki`). Do not mistake one for the other. `FALLBACK_KINDS` holds the 21
   values from herdr 0.8.0 and a test asserts it covers everything the installed herdr reports,
   so drift fails loudly.

2. **Records are JSONL, appended.** A single short `O_APPEND` write is atomic, which is what
   makes concurrent runs safe without a lock file; a whole-file JSON array rewritten each time
   would silently lose one of two simultaneous records. It also means a truncated line costs
   that line rather than the file, which `parseRecords` handles by skipping it.

3. **State lives at `<dirname(socketPath)>/herdr-tab-new/tabs.jsonl`.** The socket always sits
   in its session directory, so its dirname *is* the session directory — for the default
   session, a named one, and an explicit `HERDR_SOCKET_PATH` that matches no session at all.
   No separate lookup, and it follows the convention `zed-herdr` set.

4. **`HERDR_TAB_NEW_STATE` overrides the state path.** Added so `check:live` can assert record
   behaviour without adding a throwaway record to real state on every run.

5. **Ordering lives in `formatList`, not in the records.** Records are appended in creation
   order; the listing sorts newest-first for display.

## Things milestone 4 needs to know

- **`TabRecord.worktree` exists and is always `null`.** It is the field milestone 4 fills in,
  and milestone 5 reads to decide what to remove. Nothing else needs changing to carry it.
- **Records are written on both paths in `create()` in `index.ts`** — success and
  agent-failure — via the local `record(agentStarted)` helper. A worktree path must be added to
  both call sites, not just the happy one.
- **Validate before you create.** `assertKnownKind` runs before `resolveOrSpread`; milestone
  4's worktree checks (not a git repo, branch already checked out, path taken) must likewise
  run before `createTab`, or a failure leaves a stray tab.
- **`listAllTabs(socketPath)`** gives every live tab in the session — `herdr tab list` with no
  `--workspace` filter. That is how liveness is judged.
- **Only `claude` is installed on this machine.** `--kind codex` was verified as far as herdr:
  it passed validation, created the tab, and failed at `agent start` with *"codex did not
  start: timed out waiting for agent startup"*, which proves the kind reached herdr. A
  successful non-Claude start has **not** been observed.

## Deviations from the PRD

None. Scope is as specified: `--kind`, validation before creation, per-session records, a
listing marking gone entries, and concurrency safety. Acting on the records is still
milestone 5; worktrees are still milestone 4.

## Verification performed

- `bun run check` — 141 tests pass, `tsc --noEmit` exit 0.
- **Validation is genuinely first:** `--kind nonsense` exited 1 listing all 21 supported kinds,
  and the live tab count was unchanged (3 → 3) — no stray tab.
- **Records written:** created `m3-record-test`, `--list` showed it with the right label, tab
  id, kind and directory; confirmed on disk at
  `~/.config/herdr/herdr-tab-new/tabs.jsonl`.
- **Concurrency for real:** two instances run simultaneously took the file from 1 to 3 records,
  both present and neither corrupt.
- **Gone marking:** closed `w2:t6` by hand; `--list` then read `2 live, 1 gone` with that entry
  marked.
- **Agent-failure recorded:** `--kind codex` produced a record listed as
  `m3-codex … codex … (no agent)`.
- **Session separation:** `--list` against the `hamilton` socket reported no records while the
  default session had four, and no state directory existed under `sessions/hamilton/`.
- `bun run check:live` — 11 assertions pass; tab closed, temp state removed, real state
  untouched.
- All test tabs closed and the test state file removed afterwards; herdr back to three tabs,
  one per workspace.
