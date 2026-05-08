import * as path from "path";

/**
 * Expand ~ in paths.
 */
export function expandHome(p: string): string {
  if (p.startsWith("~/") || p === "~") {
    // os.homedir() reads the HOME env var which may be overridden
    // (e.g. by Antigravity profile aliases). Read the real home from passwd instead.
    const realHome = require("child_process")
      .execSync("getent passwd $(id -un) | cut -d: -f6")
      .toString()
      .trim();
    return path.join(realHome, p.slice(1));
  }
  return p;
}
