# Milestone 4 — Worktree mode

## What's new in the app

- **`-w` isolates a session in its own git worktree and branch.** An agent working in it cannot
  touch your open checkout — proven against a checkout with 11 uncommitted files, which came
  through completely unchanged.
- **`--branch <name>` names the branch**, or it takes the tab name. It branches from wherever
  you are.
- **An existing branch is picked up rather than refused**, so you can resume work on it.
- **Reopening a worktree that is already open just focuses it**, instead of trying to start a
  second agent in a session you already have.
- **It refuses outside a git repository before creating anything.**
- **The worktree path is recorded**, so milestone 5 will know what to remove.

## What was built

- `src/herdr/worktree.ts` — `worktreeCreateArgs`, `worktreeOpenArgs`, `parseWorktreeCreated`,
  `parseWorktreeOpened` (both carrying `alreadyOpen`), `isBranchInUse`, `worktreeIdentity`.
- `src/resolve/git.ts` — `assertGitRepo` / `NotAGitRepoError`.
- `src/system.ts` — `createWorktree`, `openWorktree`, `removeWorktree`.
- `src/cli/output.ts` — `formatWorktreeCreated`.
- `index.ts` — `-w` / `--branch`, `createInWorktree`, and **`startAndRecord`**, which collapses
  what would have been four record-writing call sites into one.
- `scripts/check-live.ts` + `bun run check:live:worktree` — creates and removes a real worktree.
- 177 tests (up from 141), still no mutation in `bun test`.

## Correction to milestone 4's own planning notes

**herdr does not put worktrees beside the repo.** Planning inferred from the one pre-existing
worktree (`~/hrock/src/worktrees/hamilton_rock/ozone-loon/hamilton_rock`) that herdr used
`<repo-parent>/worktrees/…`, and therefore shared a root with Zed's default `../worktrees`.

Running it disproved that. herdr 0.8.0 creates worktrees at
**`~/.herdr/worktrees/<repo>/<branch>`** — a central location, not beside the repo. The
`~/hrock/src/worktrees/…` one must predate this or have been made another way.

Consequences:

- **herdr and Zed do *not* share a worktree root.** Zed defaults to `../worktrees`; herdr uses
  `~/.herdr/worktrees`. Whether Zed's switcher lists a herdr-made worktree is therefore *more*
  open than planning assumed, and still needs Andrew's check. The contingency is unchanged:
  `herdr worktree create --path <PATH>` can write to Zed's layout instead.
- **The isolation property still holds, and more strongly.** `~/.herdr/worktrees/…` is nowhere
  near any project, so `matchWorkspaces` can never confuse a worktree workspace with a real one.
  Verified: after creating a worktree, `--dry-run` from the main checkout still resolved
  `compliance (w2)`.
- herdr also labels the workspace after the **branch** (`m4-probe`), not a generated slug, even
  with `--label` omitted. Better than expected.

## Bugs found by running it, not by the tests

1. **Reopening a live worktree tried to start a second agent.** The reuse path fell back to
   `worktree open` correctly, then called `agent start` on a pane that already had Claude in it.
   herdr refused — *"agent name compliance is already used"* — and the failure path handled it
   gracefully, but the behaviour was wrong. `WorktreeResult.alreadyOpen` now short-circuits:
   focus it, say so, write no duplicate record.

2. **The workspace and its agent had different names.** Workspace `m4-probe`, agent
   `compliance` — because the label was derived from the branch/directory while the branch came
   from `--branch`. `worktreeIdentity` now makes the branch the identity: label follows branch,
   unless a positional name was typed, which still wins.

## Decisions made that the PRD did not pre-specify

1. **The isolated session is a workspace, not a tab in the existing workspace.** The PRD said
   tab. `herdr worktree create` returns `{workspace, tab, root_pane, worktree}` in one call and
   brings herdr's path convention, its worktree registry, and a single
   `herdr worktree remove --workspace <id>` for teardown. Andrew chose this explicitly.

2. **`-w` is a boolean with a separate `--branch`,** not the PRD's `--worktree [branch]`, which
   was ambiguous against the positional tab name — `herdr-tab-new -w spike` must keep meaning
   "a tab called spike".

3. **`--label` is not passed**, so worktree workspaces look like ones made through herdr
   directly.

4. **`startAndRecord` unifies record writing.** Milestone 3's log warned there were two call
   sites; worktree mode would have made four, with the failure paths the easiest to forget —
   which are exactly the tabs most likely to need cleaning up.

## Things milestone 5 needs to know

- **`removeWorktree(socketPath, workspaceId)` already exists** in `src/system.ts` and is proven:
  it wraps `herdr worktree remove --workspace <id> --force`, removing the worktree *and* its
  workspace in one call.
- **It does not delete the branch.** Verified: `m4-probe` and `m4-naming` survived removal and
  had to be deleted by hand. That matches the PRD's "never delete branches", so teardown should
  leave them — but say so, or the user will think the branch went with it.
- **`--force` was used throughout.** Milestone 5 must *not* force by default: the PRD requires
  refusing a worktree with uncommitted work and reporting it. Check dirtiness first, then
  remove without `--force`, and only force on an explicit request.
- **Records distinguish the two modes by the `worktree` field** — null for a tab, a path for a
  worktree. Teardown branches on that: `closeTab` for one, `removeWorktree` for the other.
- **`startAndRecord` in `index.ts` is the single place records are written.** Keep it that way.

## Deviations from the PRD

- Worktree sessions are workspaces, not tabs (reasoning above; Andrew's explicit choice).
- `-w` + `--branch` instead of `--worktree [branch]`.
- Everything else as specified: opt-in only, both new and existing branches, worktree recorded,
  refusals before creation. Removing worktrees remains milestone 5.

## Verification performed

- `bun run check` — 177 tests pass, `tsc --noEmit` exit 0.
- **Refuses outside a repo:** `-w` in a non-git directory exited 1; workspace count unchanged
  (3 → 3).
- **The real thing:** `herdr-tab-new -w --branch m4-probe` in `~/hrock/src/compliance` created
  `~/.herdr/worktrees/compliance/m4-probe` on branch `m4-probe`, workspace `m4-probe (wA)`,
  Claude idle inside the worktree, in ~3.7s.
- **Isolation proven:** before and after, the checkout was `main`, 11 modified files,
  HEAD `71de9fa` — identical.
- **Existing branch reused:** a second run fell back to `worktree open`; after the fix it
  focused the workspace and wrote no duplicate record.
- **Naming fixed:** a fresh `-w --branch m4-naming` produced workspace `m4-naming` with an agent
  also named `m4-naming`.
- **Path isolation:** `--dry-run` from the main checkout still resolved `compliance (w2)`.
- **Teardown proven:** `herdr worktree remove --workspace {wA,wB} --force` removed both; git
  worktree list and herdr workspace list returned to their starting state.
- `bun run check:live:worktree` — 16 assertions pass, creating and removing a real worktree.
- All test branches, worktrees, tabs and the test state file removed afterwards.

### Not verified

**Whether Zed lists a herdr-created worktree in its git-panel switcher.** This needs Andrew, and
matters more than planning thought now that the two are known to use different roots.
