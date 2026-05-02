import * as fs from "fs";
import * as path from "path";
import { expandHome } from "./brain";

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
 * Copy image files from a brain artifact dir into vault assets.
 * Returns a Map of { original filename → vault-relative path for Obsidian embed }.
 *
 * Uses "assets/<filename>" as the embed path — Obsidian resolves this relative
 * to the note's folder, which is sessionDir.
 */
export function copyImages(
  imagePaths: string[],
  assetsDir: string
): Map<string, string> {
  const result = new Map<string, string>();

  for (const src of imagePaths) {
    const filename = path.basename(src);
    const dest = path.join(assetsDir, filename);

    try {
      fs.copyFileSync(src, dest);
      result.set(filename, `assets/${filename}`);
    } catch {
      // Non-fatal — image might be locked or missing
    }
  }

  return result;
}

/**
 * Write the session note to the vault.
 */
export function writeNote(sessionDir: string, filename: string, content: string): string {
  const outPath = path.join(sessionDir, filename);
  fs.writeFileSync(outPath, content, "utf-8");
  return outPath;
}
