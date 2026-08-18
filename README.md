# herdr-tab-new

Open a new agent session in the herdr workspace that belongs to the project you are in —
run from a terminal in Zed, or from anywhere else.

herdr records directories against *panes*, not workspaces, so this works out which workspace
you mean by matching your project root against the working directory of every live pane.

**Milestone 1 resolves and reports only. It never changes herdr's state.**

## Usage

```
herdr-tab-new [name] [options]

  --dry-run              Show what would be created without creating it.
  --workspace <id|label> Use this workspace instead of inferring one.
  -h, --help             Show this help.
```

```
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

Run from inside a herdr pane, herdr already exports `HERDR_SOCKET_PATH`, so the right session
is targeted with no inference at all.

## Development

```bash
bun install
bun test          # 69 tests, no herdr server required — they run against captured fixtures
bun run typecheck
bun run build     # compiles dist/herdr-tab-new, a standalone binary
```

All resolution logic lives in `src/resolve/` as pure functions over data. Only `src/system.ts`
touches the outside world, which is why the tests need neither a running herdr nor a git repo.

`test/fixtures/` holds real captured herdr output — including a case where two workspaces
share one directory, which is what the ambiguity handling is tested against.

## Notes

- **Build with `bun run build`, not `bun index.ts`.** The compiled binary has no runtime
  dependencies, so it behaves identically in a shell where mise, bun or node are absent.
- **The tab name is a starting point, not a contract.** herdr plugins exist that rename tabs
  from the agent's own conversation; nothing should depend on the name this tool sets.
