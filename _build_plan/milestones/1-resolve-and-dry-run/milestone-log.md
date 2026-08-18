# Milestone 1 — Resolve and dry run

## What's new in the app

- **`herdr-tab-new` exists and runs from anywhere** — installed at `~/.local/bin/herdr-tab-new`
  as a standalone binary, working even in a shell where bun, node and python are absent.
- **It works out which project you are in** — from Zed's own environment when you run it in a
  Zed terminal, otherwise from git, otherwise from where you are standing.
- **It works out which herdr workspace that project belongs to**, and tells you the tab it
  would create, what it would be called, and which directory it would open in.
- **It refuses to guess when two workspaces share a directory** — it lists them and asks you to
  pick, rather than starting your work in the wrong place.
- **It says clearly when there is no workspace to use**, and whether herdr-spreader has a
  layout that could build one.
- **It targets the right herdr session**, including named sessions such as `hamilton`.
- **It changes nothing.** This milestone can only look; creating the tab arrives in milestone 2.

## What was built

- `index.ts` — CLI: argument parsing, orchestration, exit codes (`0` ok, `1` usage,
  `2` herdr unavailable, `3` no workspace, `4` ambiguous).
- `src/herdr/client.ts` — `parseHerdrResponse`, `buildHerdrInvocation`, `selectHerdrPayload`,
  `HerdrError`.
- `src/herdr/types.ts` — the subset of herdr's JSON we rely on.
- `src/resolve/project-root.ts`, `socket.ts`, `workspace.ts`, `label.ts` — all pure functions
  over data.
- `src/spreader/layout.ts` — reads herdr-spreader's `config.yaml` via the `yaml` package.
- `src/cli/output.ts` — `formatPlan`, `formatNoMatch`, `formatAmbiguous`.
- `src/system.ts` — the only module that touches the outside world.
- `test/` — 69 tests, including `test/fixtures/` captured from the live herdr.
- `README.md`, `.gitignore`, package scripts (`test`, `typecheck`, `build`, `check`).

## Decisions made that the PRD did not pre-specify

1. **TypeScript on Bun, not bash.** The PRD said bash + jq + python3. Planning showed PyYAML
   exists only in the mise-managed python 3.14.4 while system python is 3.9.6 without it — so
   the tool would have worked interactively and failed in an agent-driven shell. The PRD's
   tech-stack section has been updated. `bun build --compile` removes runtime resolution
   entirely; verified by running the binary with only `git` and `herdr` on `PATH`.

2. **Not a herdr plugin.** Considered and ruled out during planning: herdr runs plugin commands
   with the plugin's directory as their cwd and supplies its own workspace context; the calling
   shell's directory is never consulted, and `herdr plugin action invoke` takes no arguments. A
   plugin would answer "which workspace is herdr showing?" when the question is "which project
   is open in Zed?". Recorded in the PRD's prior-art section. **A plugin is still the right home
   for the parked auto-fire feature** — it should invoke this binary rather than reimplement it.

3. **Default branches do not name tabs.** On `main`/`master` the project directory name is used
   instead, because otherwise every project produces a tab called `main`. Any other branch name
   wins, including one merely starting with "main" (`maintenance-window`).

4. **Slashed branch names are kept verbatim** (`compliance/e2e-capture-tests`), by explicit
   decision, and there is a test locking it in. Do not "tidy" this in a later milestone.

5. **`--workspace <id|label>` was added to milestone 1.** The ambiguity failure tells you to
   name a workspace, so the override had to exist for that advice to be actionable.

6. **Dry run is the default and only mode.** Milestone 1 is structurally incapable of mutating
   herdr. Running without `--dry-run` prints the same plan plus a note pointing at milestone 2.

## Things milestone 2 needs to know

- **herdr exits 0 on failure, and writes errors to stderr while writing success to stdout.**
  Both traps are handled in `src/herdr/client.ts` — route every herdr call through `runHerdr`
  in `src/system.ts` rather than spawning herdr directly.
- **The herdr CLI ignores `HERDR_SESSION`.** Only `HERDR_SOCKET_PATH` redirects it. `runHerdr`
  already sets the resolved socket and strips `HERDR_SESSION`; pass the socket around.
- **A herdr pane exports `HERDR_ENV=1`, `HERDR_PANE_ID`, `HERDR_TAB_ID`, `HERDR_WORKSPACE_ID`
  and `HERDR_SOCKET_PATH`.** Run from inside herdr, the workspace is known directly and
  matching could be skipped entirely — worth considering, though Zed remains the primary case.
- **`herdr session list --json` returns a bare `{"sessions":[...]}`**, not the
  `{"id":…,"result":…}` envelope every other subcommand uses. `listSessions` handles this.
- **The commands milestone 2 needs are already understood:**
  `herdr tab create --workspace <id> --cwd <path> --label <text> --focus`, then
  `herdr agent start <name> --kind claude --pane <id>` (the pane must be at an interactive
  prompt; success means herdr confirmed the agent is ready).
  `herdr tab create` returns the new tab; read the pane id from its response.
- **herdr-spreader's binary is not on `PATH`.** It lives at
  `~/.config/herdr/plugins/github/herdr-spreader-*/target/release/herdr-spreader`, or can be
  reached via `herdr plugin action invoke apply --plugin herdr-spreader`.
  `layoutStatusFor` already reports whether a layout exists; milestone 2 acts on it.
- **The live ambiguity is still present** (`hrock` w5 and `hamilton_rock` w8 share
  `/Users/andrew/hrock/src/hamilton_rock`). Andrew intends to resolve it; until then that
  project needs `--workspace`.

## Deviations from the PRD

- Tech stack changed from bash/jq/python3 to TypeScript/Bun/yaml (PRD updated).
- `--workspace` was pulled into milestone 1 (reasoning above).
- Tab naming gained the default-branch rule, which the PRD's "branch + counter" did not cover.

None of these change what the tool does for the user; they change how it decides the name and
what it is written in.

## Verification performed

- `bun test` — 69 pass, 0 fail. `bun run typecheck` — exit 0.
- Real `~/hrock/src/compliance` → workspace `compliance (w2)`, tab `compliance`, root from git.
- With `ZED_WORKTREE_ROOT` set → root credited to Zed; explicit name honoured.
- Real `~/hrock/src/hamilton_rock` → exit `4`, both candidates listed.
- `~/src/herdr-tab-new` (no workspace, no layout) → exit `3` saying both.
- `HERDR_SOCKET_PATH=/tmp/nope.sock` → exit `2` with herdr's own message.
- `HERDR_SESSION=hamilton` → resolved hamilton's socket and workspace; `HERDR_SESSION=nope`
  → exit `2` naming the known sessions.
- Compiled binary run with `PATH` containing only `git` and `herdr` — worked identically.
- `herdr workspace list` and `herdr tab list --workspace w2` unchanged afterwards: four
  workspaces, one tab each, w2's tab still `1`. Nothing was created.
