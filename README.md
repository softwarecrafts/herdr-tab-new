# herdr-tab-new

Open a new agent session in the herdr workspace that belongs to the project you are in —
run from a terminal in Zed, or from anywhere else.

herdr records directories against *panes*, not workspaces, so this works out which workspace
you mean by matching your project root against the working directory of every live pane.

If no live workspace matches, the matching herdr-spreader layout is applied with `spread`
and resolution is retried. Use `--dry-run` to see what would happen without doing it.

## Usage

```
herdr-tab-new [name] [options]

  --dry-run              Show what would be created without creating it.
  --workspace <id|label> Use this workspace instead of inferring one.
  --kind <agent>         Agent to start (default: claude).
  -w, --worktree         Isolate the session in its own git worktree.
  --branch <name>        Branch for --worktree (default: the tab name).
  --list                 List the tabs this tool created in this session.
  -h, --help             Show this help.
```

```
$ herdr-tab-new
Started claude in tab "compliance" (w2:t2), workspace compliance (w2)

  directory  /Users/andrew/hrock/src/compliance
  pane       w2:p2

$ herdr-tab-new --dry-run
New claude session → tab "compliance" in workspace compliance (w2)

  project    /Users/andrew/hrock/src/compliance  (from git)
  branch     main
  workspace  compliance (w2), 1 existing tab
  session    default
```

Exit codes: `0` ok · `1` usage · `2` herdr unavailable · `3` no matching workspace ·
`4` ambiguous workspace.

## How it decides

| Question | Answer |
|---|---|
| Which project? | `ZED_WORKTREE_ROOT` → git root → working directory |
| Which herdr session? | `HERDR_SOCKET_PATH` → `HERDR_SESSION` → the default session |
| Which workspace? | Any workspace with a pane **at or beneath** the project root. A pane *above* it never counts — otherwise a workspace opened at `~` would match every project on the machine. |
| Which of several? | The focused one. If none is focused it refuses and lists them, rather than guessing. |
| What name? | The branch, unless that is `main`/`master`, in which case the project directory name. `-2`, `-3`… appended if taken. |
| No workspace at all? | Whichever layout in `~/.herdr-spreader/` declares this project root, applied via `spread <name>`. If there is no layout, it stops and says so. |
| Which agent? | `claude`, or `--kind <agent>`. The valid list is read from `herdr agent start --help`, and an unknown kind is rejected **before** anything is created. |

Run from inside a herdr pane, herdr already exports `HERDR_SOCKET_PATH`, so the right session
is targeted with no inference at all.

## Worktree mode

`-w` gives the session its own git worktree and branch, so an agent working in it cannot
disturb your open checkout — even with uncommitted changes in it.

```
$ herdr-tab-new -w --branch feat-auth
Started claude on branch "feat-auth"

  worktree   /Users/andrew/.herdr/worktrees/compliance/feat-auth
  workspace  feat-auth (wA)
  tab        wA:t1
  pane       wA:p1

Your original checkout is untouched.
```

This uses herdr's own `worktree create`, so the isolated session is a **workspace** rather than
a tab beside your others. That is a deliberate trade: it puts the worktree where herdr expects
(`~/.herdr/worktrees/<repo>/<branch>`), registers it in `herdr worktree list`, and means
teardown is a single `herdr worktree remove --workspace <id>`.

- The branch comes from `--branch`, else the tab name. It branches from current HEAD.
- An **existing branch is reused** rather than refused.
- If that worktree is **already open**, it is focused rather than given a second agent.
- Not a git repo? It refuses **before** creating anything.
- Removing a worktree does **not** delete its branch.

## What it remembers

Every tab it creates is recorded, so `--list` can show you what is yours:

```
$ herdr-tab-new --list
2 live, 1 gone — session "default"

  live  concurrent-a    w2:t7    claude  /Users/andrew/hrock/src/compliance
  live  m3-codex        w2:t9    codex   /Users/andrew/hrock/src/compliance  (no agent)
  gone  m3-record-test  w2:t6    claude  /Users/andrew/hrock/src/compliance
```

Records live at `<session-dir>/herdr-tab-new/tabs.jsonl` — beside the herdr session they
describe, so the default and `hamilton` sessions never share state. They are JSONL, appended:
one short `O_APPEND` write is atomic, so two runs at once cannot lose each other's records,
and a truncated line from a killed process costs that line rather than the file.

Set `HERDR_TAB_NEW_STATE` to redirect the file (used by `check:live`).

## Development

```bash
bun install
bun test          # 177 tests, no herdr server required — they run against captured fixtures
bun run typecheck
bun run build     # compiles dist/herdr-tab-new, a standalone binary
bun run check:live # OPT-IN: creates a real tab, asserts, closes it again
bun run check:live:worktree # OPT-IN: also creates and removes a real worktree
```

`bun test` never touches your live herdr. `check:live` deliberately does, and is kept out of
the normal suite so a routine run — including one an agent starts — can never create tabs.

All resolution logic lives in `src/resolve/` as pure functions over data. Only `src/system.ts`
touches the outside world, which is why the tests need neither a running herdr nor a git repo.

`test/fixtures/` holds real captured herdr output — including a case where two workspaces
share one directory, which is what the ambiguity handling is tested against.

## Notes

- **Build with `bun run build`, not `bun index.ts`.** The compiled binary has no runtime
  dependencies, so it behaves identically in a shell where mise, bun or node are absent.
- **`tab create` returns a pane before its shell is ready.** herdr's `--timeout` covers agent
  readiness *after* launch, not the shell reaching a prompt, so `startAgent` retries that one
  specific rejection until the shell appears.
- **Nothing acts on the records yet.** `--list` marks entries whose tab has gone; cleaning them
  up is milestone 5.
- **The tab name is a starting point, not a contract.** herdr plugins exist that rename tabs
  from the agent's own conversation; nothing should depend on the name this tool sets.
