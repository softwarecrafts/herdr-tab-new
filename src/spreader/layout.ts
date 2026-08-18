import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Does a herdr-spreader layout exist for this project?
 *
 * Layouts live one-workspace-per-file in ~/.herdr-spreader/, which is the
 * arrangement the `spread` wrapper expects: `spread naptime` looks for
 * naptime.yml there. The plugin's own config.yaml is only a symlink that
 * `spread` re-points at whichever layout was applied last — reading it, as
 * milestone 1 did, answers for exactly one project and lies about the rest.
 *
 * Nothing here throws. An unreadable directory yields "unknown": not knowing
 * whether a layout exists is no reason to refuse to say which workspace you are
 * in.
 */

export const LAYOUT_DIR = ".herdr-spreader";

/** A layout file's basename (what `spread` takes) and its raw contents. */
export type LayoutFile = {
  file: string;
  text: string;
};

export type Layout = {
  /** Filename without extension — the argument to `spread`. */
  file: string;
  /** The workspace label herdr will show, from the layout's `name:` field. */
  label: string;
  /** Absolute project root, with ~ expanded. */
  root: string;
};

export type LayoutStatus =
  | { kind: "declared"; file: string; label: string }
  | { kind: "absent" }
  | { kind: "unknown" };

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolve(home, path.slice(2));
  return resolve(path);
}

export function parseLayouts(files: LayoutFile[], home: string): Layout[] {
  const layouts: Layout[] = [];

  for (const { file, text } of files) {
    let parsed: unknown;
    try {
      parsed = parse(text);
    } catch {
      continue;
    }

    const workspaces = (parsed as { workspaces?: unknown })?.workspaces;
    if (!Array.isArray(workspaces)) continue;

    for (const entry of workspaces) {
      const root = (entry as { root?: unknown })?.root;
      if (typeof root !== "string") continue;
      const label = (entry as { name?: unknown })?.name;
      layouts.push({
        file,
        label: typeof label === "string" ? label : file,
        root: expandHome(root, home),
      });
    }
  }

  return layouts;
}

export function layoutStatusFor(
  layouts: Layout[] | null,
  projectRoot: string,
): LayoutStatus {
  if (layouts === null) return { kind: "unknown" };

  const target = resolve(projectRoot);
  const found = layouts.find((l) => l.root === target);

  return found
    ? { kind: "declared", file: found.file, label: found.label }
    : { kind: "absent" };
}
