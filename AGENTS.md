# herdr-tab-new

A bash helper that creates a new named tab in the herdr workspace matching the current
project and starts a fresh agent session in it. Installed as `~/.local/bin/herdr-tab-new`.

## The plugin surface

`herdr-plugin.toml` and `bin/herdr-tab-new` are how herdr enters this codebase;
`index.ts` reaches them through `--plugin-action` and `--plugin-pane`, which are
deliberately absent from `--help` because herdr is their only caller. Code under
`src/plugin/` must stay pure and injectable like `src/resolve/` — only
`src/system.ts` touches the outside world, which is what lets `bun test` run
without a herdr server.

## `_build_plan/`

The `_build_plan/` folder contains the initial PRD and per-milestone prompts used to scaffold this codebase during its initial build-out phase. These files are **temporary** — they exist for documentation and guidance only. They are **not** functional: no code, configuration, or runtime logic in this codebase should import, reference, or depend on anything inside `_build_plan/`.

Do not treat `_build_plan/` as long-living documentation for the codebase. The codebase will evolve past the assumptions and decisions captured here. Once the initial milestones are complete, this folder is expected to be deleted.
