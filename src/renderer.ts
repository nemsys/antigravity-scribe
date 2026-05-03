import * as path from "path";
import TurndownService from "turndown";
import { Turn, ROLE_ICONS } from "./extractor";
import { BrainResult } from "./brain";

export interface RenderOptions {
  task: string;
  workspacePath: string;
  brainResult: BrainResult | null;
  copiedImages: Map<string, string>;
}

// ---------------------------------------------------------------------------
// Turndown instance — configured once, reused
// ---------------------------------------------------------------------------
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Preserve tables
td.addRule("table", {
  filter: ["table"],
  replacement: (_content, node) => {
    const el = node as HTMLElement;
    const rows = Array.from(el.querySelectorAll("tr"));
    if (!rows.length) return "";

    const toRow = (cells: Element[]) =>
      "| " + cells.map(c => (c.textContent || "").trim().replace(/\n/g, " ")).join(" | ") + " |";

    const header = rows[0];
    const headerCells = Array.from(header.querySelectorAll("th, td"));
    const separator = "| " + headerCells.map(() => "---").join(" | ") + " |";

    const bodyRows = rows.slice(1).map(r =>
      toRow(Array.from(r.querySelectorAll("td")))
    );

    return "\n\n" + toRow(headerCells) + "\n" + separator + "\n" + bodyRows.join("\n") + "\n\n";
  }
});

// Strip node="[object Object]" and other Antigravity attrs — already done in JS
// but keep code blocks clean
td.addRule("inlineCode", {
  filter: (node) => node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE",
  replacement: (content) => "`" + content + "`",
});

function htmlToMarkdown(html: string): string {
  try {
    return td.turndown(html).trim();
  } catch {
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

// ---------------------------------------------------------------------------
// renderNote
// ---------------------------------------------------------------------------
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

  // ── Artifacts ──────────────────────────────────────────────────────────────
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

    if (opts.brainResult.allImages.length > 0) {
      lines.push("### Screenshots & Media");
      lines.push("");
      for (const imgPath of opts.brainResult.allImages) {
        const imgFile = path.basename(imgPath);
        const vaultRelative = opts.copiedImages.get(imgFile);
        lines.push(`![[${vaultRelative ?? "assets/" + imgFile}]]`);
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
    const ts = turn.timestamp ? `  \`${turn.timestamp}\`` : "";

    lines.push(`### ${icon} ${label}${ts}`);
    lines.push("");

    // Use HTML→Markdown for agent/thought turns when available
    if ((role === "agent" || role === "thought") && turn.html) {
      lines.push(htmlToMarkdown(turn.html));
    } else {
      lines.push(turn.text.trim());
    }

    lines.push("");
  }

  return lines.join("\n");
}

function humanizeName(name: string): string {
  return name.split("_").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

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
  const safeTask = task.replace(/[^a-zA-Z0-9_-]/g, "-").replace(/-+/g, "-");
  return `${ts}_${safeTask}.md`;
}