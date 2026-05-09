import * as path from "path";
import TurndownService from "turndown";
import { ConvNode } from "./extractor";


export interface RenderOptions {
  task: string;
  workspacePath: string;
  brainUuid?: string;
  brainFullPath?: string;
}

// ---------------------------------------------------------------------------
// Turndown instance
// ---------------------------------------------------------------------------
const td = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

// Ignore images since we no longer capture them
td.addRule("ignoreImages", {
  filter: ["img"],
  replacement: () => "",
});

td.addRule("table", {
  filter: ["table"],
  replacement: (_content, node) => {
    const el = node as any;
    const rows = Array.from((el as any).querySelectorAll("tr"));
    if (!rows.length) return "";
    const toRow = (cells: any[]) =>
      "| " +
      cells.map(c => ((c as any).textContent || "").trim().replace(/\n/g, " ")).join(" | ") +
      " |";
    const header = rows[0] as any;
    const headerCells = Array.from(header.querySelectorAll("th, td"));
    const separator = "| " + headerCells.map(() => "---").join(" | ") + " |";
    const bodyRows = rows.slice(1).map((r: any) => toRow(Array.from(r.querySelectorAll("td"))));
    return "\n\n" + toRow(headerCells) + "\n" + separator + "\n" + bodyRows.join("\n") + "\n\n";
  },
});

td.addRule("inlineCode", {
  filter: node => node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE",
  replacement: content => "`" + content + "`",
});

function htmlToMarkdown(html: string): string {
  try {
    return td.turndown(html).trim();
  } catch {
    return html.replace(/<[^>]+>/g, "").trim();
  }
}

// ---------------------------------------------------------------------------
// Heading depth per role
//
// Rendered structure mirrors the visual hierarchy in the panel:
//   ## 👤 USER / ## 🤖 AGENT          (top-level turns)
//   ### ⏱ Worked for 1m               (tool-use block)
//   #### 🔍 Explored 3 files, 2 pages  (sub-step group)
//   ##### 🧠 Thought for 3s            (thought inside explored)
//   ##### 🔧 Actions                   (action group inside explored)
//   #### ▶ Ran `curl ...`              (command at worked level)
// ---------------------------------------------------------------------------
const ROLE_HEADING: Record<string, number> = {
  user: 2,
  agent: 2,
  worked: 3,
  explored: 4,
  thought: 5,
  actions: 5,
  ran: 4,
};

const ROLE_ICON: Record<string, string> = {
  user: "\u{1F464}",   // 👤
  agent: "\u{1F916}",   // 🤖
  worked: "\u23F1",      // ⏱
  explored: "\u{1F50D}",   // 🔍
  thought: "\u{1F9E0}",   // 🧠
  actions: "\u{1F527}",   // 🔧
  ran: "\u25B6",      // ▶
};

function h(depth: number): string {
  return "#".repeat(Math.max(1, Math.min(depth, 6)));
}

// ---------------------------------------------------------------------------
// renderNode — recursive
// ---------------------------------------------------------------------------
function renderNode(node: ConvNode, lines: string[]): void {
  const depth = ROLE_HEADING[node.role] ?? 3;
  const icon = ROLE_ICON[node.role] ?? "\u2753";
  const hdr = h(depth);

  switch (node.role) {

    case "user": {
      lines.push(`${hdr} ${icon} USER`);
      lines.push("");
      lines.push(node.label);
      lines.push("");
      break;
    }

    case "agent": {
      lines.push(`${hdr} ${icon} AGENT`);
      lines.push("");
      lines.push(node.html ? htmlToMarkdown(node.html) : node.detail);
      lines.push("");
      break;
    }

    case "worked": {
      lines.push(`${hdr} ${icon} ${node.label}`);
      lines.push("");
      for (const child of node.children) renderNode(child, lines);
      break;
    }

    case "explored": {
      lines.push(`${hdr} ${icon} ${node.label}`);
      lines.push("");
      for (const child of node.children) renderNode(child, lines);
      break;
    }

    case "thought": {
      lines.push(`${hdr} ${icon} ${node.label}`);
      lines.push("");
      const body = node.html ? htmlToMarkdown(node.html) : node.detail;
      if (body) {
        lines.push(body);
        lines.push("");
      }
      break;
    }

    case "actions": {
      lines.push(`${hdr} ${icon} Actions`);
      lines.push("");
      for (const action of node.children) {
        const detail = action.detail ? ` \`${action.detail}\`` : "";
        lines.push(`- ${action.label}${detail}`);
      }
      lines.push("");
      break;
    }

    case "ran": {
      const cmd = node.detail ? ` \`${node.detail}\`` : "";
      lines.push(`${hdr} ${icon} ${node.label}${cmd}`);
      lines.push("");
      break;
    }

    // 'action' nodes only appear as list items inside 'actions'; skip standalone
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// renderNote — public entry point
// ---------------------------------------------------------------------------
export function renderNote(nodes: ConvNode[], opts: RenderOptions): string {
  const now = new Date();
  const isoDate = now.toISOString().split("T")[0];
  const isoTime = now.toTimeString().slice(0, 5);

  const lines: string[] = [];

  // ── Frontmatter ──────────────────────────────────────────────────────────
  lines.push("---");
  lines.push(`date: ${isoDate}`);
  lines.push(`time: ${isoTime}`);
  lines.push(`agent: antigravity`);
  lines.push(`task: ${opts.task}`);
  lines.push(`workspace: "${opts.workspacePath}"`);

  lines.push(`tags:`);
  lines.push(`  - antigravity-session-full-log`);

  if (opts.brainUuid) {
    lines.push(`brain_uuid: ${opts.brainUuid}`);
  }

  if (opts.brainFullPath && opts.brainUuid) {
    lines.push(`brain_full_path:`);
    lines.push(`  - ${opts.brainFullPath}/${opts.brainUuid}`);
  }
  lines.push("---");
  lines.push("");



  // ── Session ───────────────────────────────────────────────────────────────
  lines.push("## Session");
  lines.push("");

  if (nodes.length === 0) {
    lines.push("*(no turns captured)*");
    lines.push("");
  }

  for (const node of nodes) {
    renderNode(node, lines);
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------


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