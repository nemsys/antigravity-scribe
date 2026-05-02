import * as path from "path";
import { Turn, ROLE_ICONS } from "./extractor";
import { BrainResult } from "./brain";

export interface RenderOptions {
  task: string;
  workspacePath: string;
  brainResult: BrainResult | null;
  /** Relative paths of copied images inside vault (for ![[]] links) */
  copiedImages: Map<string, string>;
}

/**
 * Build the full Obsidian session note.
 *
 * Structure:
 *   ---frontmatter---
 *   ## Artifacts        (if any)
 *   ---
 *   ## Session          (chat turns)
 */
export function renderNote(turns: Turn[], opts: RenderOptions): string {
  const now = new Date();
  const isoDate = now.toISOString().split("T")[0];
  const isoTime = now.toTimeString().slice(0, 5);

  const lines: string[] = [];

  // ── Frontmatter ────────────────────────────────────────────────────────────
  lines.push("---");
  lines.push(`date: ${isoDate}`);
  lines.push(`time: ${isoTime}`);
  lines.push(`agent: antigravity`);
  lines.push(`task: ${opts.task}`);
  lines.push(`workspace: "${opts.workspacePath}"`);
  if (opts.brainResult) {
    lines.push(`brain_uuid: ${opts.brainResult.uuid}`);
  }
  lines.push(`tags:`);
  lines.push(`  - agent-session`);
  lines.push(`  - antigravity`);
  lines.push("---");
  lines.push("");

  // ── Artifacts section ──────────────────────────────────────────────────────
  if (opts.brainResult && opts.brainResult.artifacts.length > 0) {
    lines.push("## Artifacts");
    lines.push("");

    for (const artifact of opts.brainResult.artifacts) {
      const title = humanizeName(artifact.name);
      const summary = artifact.meta.summary || "";
      const updatedAt = artifact.meta.updatedAt
        ? new Date(artifact.meta.updatedAt).toLocaleString()
        : "";

      lines.push(`### ${title}`);
      if (summary) lines.push(`> ${summary}`);
      if (updatedAt) lines.push(`*Updated: ${updatedAt}*`);
      lines.push("");
      lines.push(artifact.content);
      lines.push("");
    }

    // Images (screenshots, browser recordings etc.)
    if (opts.brainResult.allImages.length > 0) {
      lines.push("### Screenshots & Media");
      lines.push("");
      for (const imgPath of opts.brainResult.allImages) {
        const imgFile = path.basename(imgPath);
        const vaultRelative = opts.copiedImages.get(imgFile);
        if (vaultRelative) {
          // Obsidian embed syntax
          lines.push(`![[${vaultRelative}]]`);
        } else {
          lines.push(`![[assets/${imgFile}]]`);
        }
      }
      lines.push("");
    }

    lines.push("---");
    lines.push("");
  }

  // ── Session turns ──────────────────────────────────────────────────────────
  lines.push("## Session");
  lines.push("");

  if (turns.length === 0) {
    lines.push("*(no turns captured)*");
    lines.push("");
  }

  for (const turn of turns) {
    const role = turn.role ?? "unknown";
    const icon = ROLE_ICONS[role] ?? "\u2753";
    const label = role.toUpperCase().replace("_", " ");
    const ts = turn.timestamp ?? now.toISOString();

    lines.push(`### ${icon} ${label}  \`${ts}\``);
    lines.push("");
    lines.push(turn.text.trim());
    lines.push("");
  }

  return lines.join("\n");
}

/** "implementation_plan" → "Implementation Plan" */
function humanizeName(name: string): string {
  return name
    .split("_")
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Build a timestamped filename for a session note. */
export function sessionFilename(task: string, date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ts = [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "_",
    pad(date.getHours()),
    pad(date.getMinutes()),
  ].join("");
  // Sanitise task label for use in a filename
  const safeTask = task.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return `${ts}_${safeTask}.md`;
}
