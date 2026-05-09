import * as fs from "fs";
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

/**
 * Find the most recently modified brain UUID directory.
 */
export function getActiveBrainUuid(brainPath: string): { uuid: string | null; fullPath: string } {
  const fullPath = expandHome(brainPath);
  try {
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    let latestUuid: string | null = null;
    let maxMtime = 0;

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const dirPath = path.join(fullPath, entry.name);
        const stats = fs.statSync(dirPath);
        if (stats.mtimeMs > maxMtime) {
          maxMtime = stats.mtimeMs;
          latestUuid = entry.name;
        }
      }
    }
    return { uuid: latestUuid, fullPath };
  } catch (err) {
    return { uuid: null, fullPath };
  }
}
