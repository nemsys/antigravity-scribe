import * as fs from "fs";
import * as path from "path";
import { expandHome } from "./utils";

export interface VaultPaths {
  sessionDir: string;   // <vault>/<vaultFolder>/
  assetsDir: string;    // <vault>/<vaultFolder>/assets/
}

/**
 * Resolve and create the vault output directories.
 */
export function prepareVault(vaultPath: string, vaultFolder: string): VaultPaths {
  if (!vaultPath || !vaultPath.trim()) {
    throw new Error(
      "agscribe.vaultPath is not set.\n" +
      "Open Settings → search 'Antigravity Scribe' → set your Obsidian vault path."
    );
  }

  const resolvedVault = expandHome(vaultPath.trim());
  if (!fs.existsSync(resolvedVault)) {
    throw new Error(`Vault path not found: ${resolvedVault}`);
  }

  const sessionDir = path.join(resolvedVault, vaultFolder);
  const assetsDir = path.join(sessionDir, "assets");

  fs.mkdirSync(sessionDir, { recursive: true });
  fs.mkdirSync(assetsDir, { recursive: true });

  return { sessionDir, assetsDir };
}


/**
 * Write the session note to the vault.
 */
export function writeNote(sessionDir: string, filename: string, content: string): string {
  const outPath = path.join(sessionDir, filename);
  fs.writeFileSync(outPath, content, "utf-8");
  return outPath;
}
