# Focus behaviour and attaching into Zed

A change on top of the completed PRD, not a milestone.

## What changed for you

- **Nothing this tool creates takes focus inside herdr any more.** Tabs and worktree workspaces
  alike. herdr keeps showing whatever you were watching.
- **Run it from a Zed terminal and that terminal becomes the new session.** You are handed
  straight to the agent rather than going to look for it.
- **Run it from inside herdr and it just reports.** You are already there.

## Why the two pull against each other, and how it resolves

Not focusing and "open herdr at the new tab" are contradictory if they happen in the same place
at the same moment. They resolve because they happen in *different* places: herdr's internal
focus is left alone, and you are brought to the session on the Zed side instead.

## Why attaching in place is the only mechanism

The `zed` CLI opens paths only. It cannot spawn a terminal running a command, and a CLI cannot
trigger a Zed task from outside. But this process is already running in a Zed terminal, so it
can replace itself with `herdr agent attach <pane>`. That consumes the terminal you typed the
command in — which is the intended behaviour, not a side effect.

## Scope correction made during planning

An earlier draft gated attaching on stdin being a TTY, so that an agent running this as a bash
command could not hang on an interactive attach. Andrew never runs this via an agent, so that
guard was machinery for a case that does not arise and was dropped. The only skip is `HERDR_ENV`.

Worth remembering if the tool is ever driven by an agent: attaching would hang it, and the TTY
check is the fix.

## Decisions

- `--focus` became an explicit `--no-focus` on tab create, worktree create and worktree open.
- **No `--focus` flag was added.** One behaviour.
- **Worktree mode is included as an experiment.** Landing in an isolated workspace may still be
  wanted; it is one argument per call site, kept that way so reverting is trivial.
- `--takeover` is not passed to `agent attach`. Whether it is ever needed is unknown — see below.

## Verified

- `bun run check` — 242 tests, `tsc --noEmit` exit 0.
- **Focus really is not stolen**, measured rather than eyeballed: the focused workspace was
  `~ (w4)` before and after creating a tab session, and the new tab reported `focused=false`.
- **Same for worktree mode**: focused workspace unchanged across creating `focus-probe-wt (wH)`.
- **Running from a herdr pane reports and exits** rather than attaching, which is also what made
  the above testable at all.

## Not verified

**The attach itself.** It only happens outside herdr, and every run available here is from a
herdr pane, so this path was never executed. Andrew needs to run `herdr-tab-new` in a Zed
terminal and confirm that terminal becomes the session.

Two things that will only be learned by doing that:

- whether `--takeover` is needed when the herdr client holds the same tab in the background;
- what a plain Zed terminal actually exports (`env | grep -i zed`), which would allow the attach
  condition to be narrowed from "not inside herdr" to "is a Zed terminal", if that is wanted.
