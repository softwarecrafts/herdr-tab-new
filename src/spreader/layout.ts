import { resolve } from "node:path";
import { parse } from "yaml";

/**
 * Does herdr-spreader know how to build a workspace for this project?
 *
 * When no live workspace matches, milestone 2 will fall back to spreader. Here
 * we only *report* whether that fallback has anything to work with, so the "no
 * matching workspace" failure can say which of the two situations you are in.
 *
 * This never throws. A missing or malformed config yields "unknown" rather than
 * failing the run: not being able to read spreader's config is not a reason to
 * refuse to tell you which workspace you are in.
 */

export type LayoutStatus =
  | { kind: "declared"; name: string }
  | { kind: "absent" }
  | { kind: "unknown" };

export const SPREADER_CONFIG_PATH =
  ".config/herdr/plugins/config/herdr-spreader/config.yaml";

function expandHome(path: string, home: string): string {
  if (path === "~") return home;
  if (path.startsWith("~/")) return resolve(home, path.slice(2));
  return resolve(path);
}

export function layoutStatusFor(
  configText: string | null,
  projectRoot: string,
  home: string,
): LayoutStatus {
  if (!configText) return { kind: "unknown" };

  let parsed: unknown;
  try {
    parsed = parse(configText);
  } catch {
    return { kind: "unknown" };
  }

  const workspaces = (parsed as { workspaces?: unknown })?.workspaces;
  if (!Array.isArray(workspaces)) return { kind: "unknown" };

  const target = resolve(projectRoot);

  for (const entry of workspaces) {
    const root = (entry as { root?: unknown })?.root;
    if (typeof root !== "string") continue;
    if (expandHome(root, home) === target) {
      const name = (entry as { name?: unknown })?.name;
      return { kind: "declared", name: typeof name === "string" ? name : "?" };
    }
  }

  return { kind: "absent" };
}
