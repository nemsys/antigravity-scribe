import * as fs from "fs";
import * as path from "path";
import * as os from "os";

export interface ArtifactMeta {
  artifactType: string;
  summary: string;
  updatedAt: string;
}

export interface Artifact {
  name: string;           // e.g. "task", "implementation_plan"
  meta: ArtifactMeta;
  content: string;        // contents of the .resolved file
  images: string[];       // absolute paths to .png files in the same dir
}

export interface BrainResult {
  uuid: string;
  artifacts: Artifact[];
  allImages: string[];    // all .png paths in the dir (some may not belong to an artifact)
}

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
 * Find the most recently modified UUID directory inside brainPath.
 * This is the active session's artifact folder — Antigravity writes
 * artifact files in real-time, so the hottest dir is always the current one.
 */
export function findActiveBrainDir(brainPath: string): string | null {
  const resolved = expandHome(brainPath);

  if (!fs.existsSync(resolved)) {
    throw new Error(`Brain path not found: ${resolved}\nCheck agscribe.brainPath in settings.`);
  }

  const entries = fs.readdirSync(resolved, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith("."))
    .map(d => {
      const full = path.join(resolved, d.name);
      return { name: d.name, mtime: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtime - a.mtime);

  return entries[0]?.name ?? null;
}

/**
 * Read all artifacts from a brain UUID directory.
 * - Reads *.resolved (final version) — skips *.resolved.N (revision history)
 * - Reads paired *.metadata.json for each artifact
 * - Collects all *.png paths
 */
export function readArtifacts(brainPath: string, uuid: string): BrainResult {
  const dir = path.join(expandHome(brainPath), uuid);
  const files = fs.readdirSync(dir);

  // Collect .resolved base names (e.g. "task.md", "implementation_plan.md")
  // A valid .resolved file is exactly "<name>.resolved" with no further extension
  const resolvedFiles = files.filter(f => {
    if (!f.endsWith(".resolved")) return false;
    // Exclude revision files: task.md.resolved.0, task.md.resolved.1 etc.
    const withoutSuffix = f.slice(0, -(".resolved".length));
    return !withoutSuffix.match(/\.\d+$/);
  });

  const allImages = files
    .filter(f => f.toLowerCase().endsWith(".png"))
    .map(f => path.join(dir, f));

  const artifacts: Artifact[] = [];

  for (const resolvedFile of resolvedFiles) {
    const baseName = resolvedFile.slice(0, -(".resolved".length)); // e.g. "task.md"
    const metaFile = path.join(dir, `${baseName}.metadata.json`);
    const resolvedPath = path.join(dir, resolvedFile);

    // Skip if no metadata (probably a temp file)
    if (!fs.existsSync(metaFile)) continue;

    let meta: ArtifactMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaFile, "utf-8"));
    } catch {
      continue;
    }

    const content = fs.readFileSync(resolvedPath, "utf-8").trim();
    if (!content) continue;

    // Human-readable name: "task.md" → "task", "implementation_plan.md" → "implementation_plan"
    const name = baseName.replace(/\.[^.]+$/, "");

    artifacts.push({ name, meta, content, images: allImages });
  }

  // Sort by updatedAt ascending so task comes before implementation_plan etc.
  artifacts.sort((a, b) =>
    new Date(a.meta.updatedAt).getTime() - new Date(b.meta.updatedAt).getTime()
  );

  return { uuid, artifacts, allImages };
}