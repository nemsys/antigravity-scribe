// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeRole =
  | "user"
  | "agent"
  | "worked"
  | "explored"
  | "thought"
  | "actions"    // group container — children are individual 'action' nodes
  | "action"     // single action row: Analyzed, Created outline, Read page
  | "ran"        // Ran / Edited / Created command row
  | "artifact"   // Artifact card (task.md, implementation_plan.md, etc.)
  | "files_modified" // Files Modified section with child filenames
  | "_no_chat";

export interface ConvNode {
  role: NodeRole;
  /** Primary text: user message, "Worked for 1m", "Thought for 3s", verb "Analyzed" … */
  label: string;
  /** Secondary text: chip ref "llms-ctx-full.txt#L1-800", command, thought body, filename */
  detail: string;
  /** Raw innerHTML for agent / thought content — converted to Markdown by renderer */
  html: string | null;
  children: ConvNode[];
}

// ---------------------------------------------------------------------------
// Extract conversation title from the panel header
// ---------------------------------------------------------------------------

export const EXTRACT_TITLE_JS = `(function () {
  const el = document.querySelector(
    "div.flex.min-w-0.items-center.overflow-hidden.text-ellipsis.whitespace-nowrap"
  );
  return el ? el.textContent.replace(/\\s+/g, " ").trim() : "";
})()`;

// ---------------------------------------------------------------------------
// Main extraction — returns ConvNode[] as JSON string
//
// Ported from scraper.py which handles:
//   • User messages (with @mentions)
//   • Thought blocks (collapsed & expanded)
//   • Worked-for wrappers with expanded tool-use children
//   • Explored / Edited action groups
//   • Analyzed rows (file / folder style)
//   • Ran command rows
//   • Artifact cards
//   • Files Modified sections
//   • Standalone agent response text
// ---------------------------------------------------------------------------

export const EXTRACT_JS = `(function () {

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Join classList to a string for easy includes() checks. */
  function cs(el) {
    return el && el.classList ? [...el.classList].join(" ") : "";
  }

  /** Collapse whitespace and trim. */
  function clean(text) {
    return text ? text.replace(/\\s+/g, " ").trim() : "";
  }

  /**
   * Walk text nodes, skipping:
   *   - SVG elements
   *   - visibility:hidden / display:none elements
   *   - elements with class "hidden" (unless they also have "group-hover:")
   *   - animate-spin spinners
   */
  function walkText(el) {
    const parts = [];
    for (const child of el.childNodes) {
      if (child.nodeType === 3) {
        parts.push(child.textContent);
      } else if (child.nodeType === 1) {
        const tag = child.tagName.toLowerCase();
        if (tag === "svg") continue;
        const style = child.getAttribute("style") || "";
        if (style.includes("visibility: hidden") || style.includes("display: none")) continue;
        const cls = cs(child);
        if (cls.split(" ").includes("hidden") && !cls.includes("group-hover:")) continue;
        if (cls.includes("animate-spin")) continue;
        parts.push(walkText(child));
      }
    }
    return parts.join(" ");
  }

  function getText(el) {
    return el ? clean(walkText(el)) : "";
  }

  // ── Button verb + detail ───────────────────────────────────────────────────

  /**
   * Action buttons have two <span> children:
   *   span.opacity-70  → verb ("Analyzed", "Explored", "Worked for")
   *   span (no opacity) → detail (filename, "3 files", "1m 30s")
   * Returns [verb, detail].
   */
  function btnParts(btn) {
    const spans = [...btn.children].filter(n => n.tagName === "SPAN");
    let verb = "", detail = "";
    for (const sp of spans) {
      const cls = cs(sp);
      if (cls.includes("google-symbols")) continue;
      const t = getText(sp);
      if (!t) continue;
      if (cls.includes("opacity-70") || cls.includes("cursor-pointer")) {
        verb = t;
      } else {
        detail = t;
      }
    }
    return [verb, detail];
  }

  // ── User message ────────────────────────────────────────────────────────────

  function parseUser(step) {
    const td = step.querySelector("div.whitespace-pre-wrap.text-sm");
    if (!td) return "";
    const parts = [];
    for (const ch of td.childNodes) {
      if (ch.nodeType === 3) {
        parts.push(ch.textContent);
      } else if (ch.nodeType === 1) {
        if (cs(ch).includes("context-scope-mention")) {
          parts.push("@[" + clean(ch.textContent) + "]");
        } else {
          parts.push(ch.textContent);
        }
      }
    }
    return clean(parts.join(""));
  }

  // ── Thought block ───────────────────────────────────────────────────────────

  function parseThought(isolate) {
    const btn = isolate.querySelector("button");
    const sp = btn && btn.querySelector("span.cursor-pointer");
    const header = sp ? getText(sp) : (btn ? getText(btn) : "Thought");

    const cdiv = isolate.querySelector("div.overflow-hidden.transition-all");
    let contentHTML = null;
    if (cdiv) {
      const md = cdiv.querySelector("div.leading-relaxed");
      if (md) contentHTML = md.innerHTML;
    }
    return { role: "thought", label: header, detail: "", html: contentHTML, children: [] };
  }

  // ── Analyzed action row ─────────────────────────────────────────────────────

  function parseAnalyzed(row) {
    const label = row.querySelector("span.shrink-0.opacity-70");
    const action = label ? getText(label) : "";
    const mention = row.querySelector("span.inline-flex.break-all");
    const fname = mention ? getText(mention) : "";
    return { role: "action", label: action, detail: fname, html: null, children: [] };
  }

  // ── Ran command row ─────────────────────────────────────────────────────────

  function parseRan(row) {
    const sp = row.querySelector("span.font-mono");
    return { role: "ran", label: "Ran", detail: sp ? clean(sp.textContent) : "", html: null, children: [] };
  }

  // ── Artifact card ───────────────────────────────────────────────────────────

  function parseArtifact(card) {
    const ts = card.querySelector("span.inline-flex.break-all");
    const title = ts ? getText(ts) : "";
    const ds = card.querySelector("span.text-sm.opacity-70.line-clamp-3");
    const desc = ds ? getText(ds) : "";
    return { role: "artifact", label: title, detail: desc, html: null, children: [] };
  }

  // ── Files Modified section ──────────────────────────────────────────────────

  function parseFilesModified(section) {
    const fms = section.querySelectorAll("span.inline-flex.break-all");
    const children = [...fms]
      .map(fm => ({ role: "action", label: getText(fm), detail: "", html: null, children: [] }))
      .filter(n => n.label);
    return { role: "files_modified", label: "Files Modified", detail: "", html: null, children };
  }

  // ── Recursive content walker ────────────────────────────────────────────────

  /**
   * Mirrors scraper.py _walk(): traverses the expanded content area inside
   * a Worked-for or Explored block and returns a flat list of ConvNodes.
   */
  function walk(container) {
    const items = [];
    if (!container) return items;

    for (const child of container.children) {
      const cls = cs(child);
      const classes = cls.split(" ");

      // ── Thought blocks (.isolate) ──────────────────────────────────────
      if (classes.includes("isolate")) {
        const btn = child.querySelector("button");
        if (btn && getText(btn).includes("Thought for")) {
          items.push(parseThought(child));
        }
        continue;
      }

      // ── Explored / Edited action group (div.relative with button) ──────
      if (child.tagName === "DIV" && classes.includes("relative")) {
        const btn = child.querySelector(":scope > button");
        if (btn) {
          const [v, d] = btnParts(btn);
          if (v === "Explored" || v === "Edited") {
            const exp = child.querySelector(":scope > div[style*='opacity: 1']");
            const children = exp ? walk(exp) : [];
            items.push({ role: "explored", label: v, detail: d, html: null, children });
          }
        } else {
          // No button — plain wrapper div; recurse
          items.push(...walk(child));
        }
        continue;
      }

      // ── flex-row divs: Ran / Analyzed ──────────────────────────────────
      if (child.tagName === "DIV" && cls.includes("flex-row")) {
        // Ran command
        const ranSp = child.querySelector("span.opacity-70");
        if (ranSp && getText(ranSp).includes("Ran")) {
          items.push(parseRan(child));
          continue;
        }

        // Standard analyzed row
        const al = child.querySelector("span.shrink-0.opacity-70");
        if (al) {
          const node = parseAnalyzed(child);
          if (node.label || node.detail) items.push(node);
          continue;
        }

        // Folder-style analyzed (collapsible directory)
        const ad = child.querySelector("[class*=cursor-pointer][class*=rounded-lg]");
        if (ad) {
          const node = parseAnalyzed(ad);
          if (node.label || node.detail) {
            const subChildren = [];
            const subC = child.querySelector("div.overflow-hidden.pl-3");
            if (subC) {
              for (const sr of subC.querySelectorAll("div.flex.flex-row")) {
                const sn = parseAnalyzed(sr);
                if (sn.label || sn.detail) subChildren.push(sn);
              }
            }
            node.children = subChildren;
            items.push(node);
          }
          continue;
        }
      }

      // ── Response text block (px-2 py-1 wrapper) ────────────────────────
      if (child.tagName === "DIV" && cls.includes("px-2") && cls.includes("py-1")) {
        const md = child.querySelector("div.leading-relaxed");
        if (md) {
          const t = clean(md.textContent);
          if (t && t.length > 3) {
            items.push({ role: "agent", label: "", detail: "", html: md.innerHTML, children: [] });
          }
        }
        continue;
      }

      // ── Any other div — recurse ────────────────────────────────────────
      if (child.tagName === "DIV") {
        items.push(...walk(child));
      }
    }

    return items;
  }

  // ── Turn parser ─────────────────────────────────────────────────────────────

  function parseTurn(turnDiv) {
    const nodes = [];
    const group = turnDiv.querySelector("div.flex.flex-col.group.w-full") || turnDiv;

    // ── User message ───────────────────────────────────────────────────────
    const us = group.querySelector("[data-testid='user-input-step']");
    if (us) {
      const userText = parseUser(us);
      if (userText) {
        nodes.push({ role: "user", label: userText, detail: "", html: null, children: [] });
      }
    }

    // ── Agent content (all children of group) ─────────────────────────────
    for (const child of group.children) {
      const cls = cs(child);
      const classes = cls.split(" ");

      // Skip sticky header
      if (classes.includes("sticky")) continue;

      // Skip timestamp row
      if (cls.includes("pt-3")) continue;

      // ── Artifact cards ─────────────────────────────────────────────────
      const cards = child.querySelectorAll("div.border.p-2");
      if (cards.length > 0) {
        for (const card of cards) {
          const node = parseArtifact(card);
          if (node.label) nodes.push(node);
        }
        // If there's also response text in this container, fall through
        if (!child.querySelector("div.leading-relaxed.select-text")) continue;
      }

      // ── Files Modified ─────────────────────────────────────────────────
      const fl = child.querySelector("span.text-sm.opacity-70");
      if (fl && getText(fl).includes("Files Modified")) {
        const node = parseFilesModified(child);
        if (node.children.length > 0) nodes.push(node);
        continue;
      }

      // ── Worked-for block ───────────────────────────────────────────────
      // Scan direct children for a div.relative containing a "Worked" button.
      let workedBtnContainer = null;

      outer: for (const sub of child.children) {
        const subCls = cs(sub);
        if (sub.tagName === "DIV" && subCls.includes("relative")) {
          const btn = sub.querySelector(":scope > button");
          if (btn) {
            const [v, d] = btnParts(btn);
            if (v && v.includes("Worked")) {
              nodes.push({ role: "worked", label: (v + " " + d).trim(), detail: "", html: null, children: [] });
              workedBtnContainer = sub;
              break outer;
            }
          }
        } else if (sub.tagName === "DIV") {
          // One level deeper — some layouts nest the worked button
          const innerBtn = sub.querySelector(":scope > div.relative > button");
          if (innerBtn) {
            const [v, d] = btnParts(innerBtn);
            if (v && v.includes("Worked")) {
              nodes.push({ role: "worked", label: (v + " " + d).trim(), detail: "", html: null, children: [] });
              workedBtnContainer = innerBtn.parentElement;
              break outer;
            }
          }
        }
      }

      if (workedBtnContainer) {
        // Expanded tool-use steps live in the div[style*='opacity: 1'] sibling
        const exp = workedBtnContainer.querySelector(":scope > div[style*='opacity: 1']");
        const workedChildren = exp ? walk(exp) : [];

        // Attach children to the worked node we just pushed
        const workedNode = nodes[nodes.length - 1];
        if (workedNode && workedNode.role === "worked") {
          workedNode.children = workedChildren;
        }

        // Collect any response text that follows the worked block
        // (siblings of workedBtnContainer inside this child)
        let passedWorked = false;
        for (const sib of child.children) {
          if (sib === workedBtnContainer) { passedWorked = true; continue; }
          if (!passedWorked) continue;
          const sibCls = cs(sib);
          if (sibCls.includes("px-2") && sibCls.includes("py-1")) {
            const md = sib.querySelector("div.leading-relaxed");
            if (md) {
              const t = clean(md.textContent);
              if (t && t.length > 3) {
                nodes.push({ role: "agent", label: "", detail: "", html: md.innerHTML, children: [] });
              }
            }
          }
        }
        continue;
      }

      // ── Standalone thought (no Worked wrapper) ─────────────────────────
      const iso = child.querySelector("div.isolate");
      if (iso) {
        const btn = iso.querySelector("button");
        if (btn && getText(btn).includes("Thought for")) {
          nodes.push(parseThought(iso));
          // Response text in the same container
          for (const sibCh of child.querySelectorAll("div.px-2.py-1")) {
            const md = sibCh.querySelector("div.leading-relaxed");
            if (md) {
              const t = clean(md.textContent);
              if (t && t.length > 3) {
                nodes.push({ role: "agent", label: "", detail: "", html: md.innerHTML, children: [] });
              }
            }
          }
          continue;
        }
      }

      // ── Standalone response text ───────────────────────────────────────
      const mds = child.querySelectorAll("div.leading-relaxed.select-text");
      for (const md of mds) {
        // Skip if inside an opacity-0 ancestor (hidden/faded content)
        let skip = false;
        let p = md.parentElement;
        while (p && p !== child) {
          if (cs(p).includes("opacity-0")) { skip = true; break; }
          p = p.parentElement;
        }
        if (skip) continue;
        const t = clean(md.textContent);
        if (t && t.length > 3) {
          nodes.push({ role: "agent", label: "", detail: "", html: md.innerHTML, children: [] });
        }
      }
    }

    return nodes;
  }

  // ── Entry point ─────────────────────────────────────────────────────────────

  const conv = document.querySelector("#conversation");
  if (!conv) {
    return JSON.stringify([
      { role: "_no_chat", label: "Chat panel not found", detail: "", html: null, children: [] }
    ]);
  }

  const allNodes = [];
  const turnDivs = conv.querySelectorAll(
    "div.relative.flex.flex-col.gap-y-3 > div.flex.items-start"
  );

  for (const turnDiv of turnDivs) {
    allNodes.push(...parseTurn(turnDiv));
  }

  return JSON.stringify(allNodes);
})()`;