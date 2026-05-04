// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NodeRole =
  | "user"
  | "agent"
  | "worked"
  | "explored"
  | "thought"
  | "actions"   // group container — children are individual 'action' nodes
  | "action"    // single action row: Analyzed, Created outline, Read page
  | "ran"       // Ran / Edited / Created command row
  | "_no_chat";

export interface ConvNode {
  role: NodeRole;
  /** Primary text: user message, "Worked for 1m", "Thought for 3s", verb "Analyzed" … */
  label: string;
  /** Secondary text: chip ref "llms-ctx-full.txt#L1-800", command, thought body */
  detail: string;
  /** Raw innerHTML for agent / thought content — converted to Markdown by renderer */
  html: string | null;
  children: ConvNode[];
}

// ---------------------------------------------------------------------------
// Extract conversation title from the panel header
// ---------------------------------------------------------------------------
export const EXTRACT_TITLE_JS = `(function() {
  const panel = document.querySelector('.antigravity-agent-side-panel');
  if (!panel) return null;
  const titleEl = panel.querySelector('.flex.min-w-0.items-center.overflow-hidden.text-ellipsis.whitespace-nowrap');
  if (!titleEl) return null;
  const t = (titleEl.innerText || titleEl.textContent || "").trim();
  if (t && t.length > 2 && t.length < 120) return t;
  return null;
})();`;

// ---------------------------------------------------------------------------
// Main extraction — returns ConvNode[] as JSON string
// ---------------------------------------------------------------------------
export const EXTRACT_JS = String.raw`
(function () {
  "use strict";

  // ── Find chat root ────────────────────────────────────────────────────────

  function containerOf(el) {
    let n = el.parentElement;
    for (let i = 0; i < 30 && n && n !== document.body; i++) {
      const r = n.getBoundingClientRect();
      if (r.height > 350 && r.width > 250) return n;
      n = n.parentElement;
    }
    return null;
  }

  function findChatRoot() {
    for (const sel of [
      '[placeholder*="Ask anything"]',
      '[aria-placeholder*="Ask anything"]',
      '[aria-label*="Ask anything"]',
    ]) {
      const el = document.querySelector(sel);
      if (el) { const c = containerOf(el); if (c) return c; }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.innerText || "").trim();
      if (
        t === "Ask anything, @ to mention, / for workflows" &&
        !node.children.length
      ) {
        const c = containerOf(node);
        if (c) return c;
      }
    }
    return null;
  }

  const chatRoot = findChatRoot();
  if (!chatRoot) {
    return JSON.stringify([
      { role: "_no_chat", label: "Chat panel not found", detail: "", html: null, children: [] },
    ]);
  }

  // ── DOM helpers ───────────────────────────────────────────────────────────

  function getHTML(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("style, script, link").forEach(t => t.remove());
    clone.querySelectorAll("[node]").forEach(t => t.removeAttribute("node"));
    return clone.innerHTML.trim();
  }

  function deepText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("style, script, link, .google-symbols, svg").forEach(t => t.remove());
    return (clone.textContent || "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, "")
      .replace(/\.[a-zA-Z_-]+\s*\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function cleanUserText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      "style, script, link, button, [data-testid='revert-button'], .google-symbols, svg"
    ).forEach(t => t.remove());
    return (clone.innerText || clone.textContent || "").trim();
  }

  // ── Chip text extraction ──────────────────────────────────────────────────
  //
  // Two chip shapes appear in the DOM:
  //   File chip:  .inline-flex.break-all.leading-tight.select-text
  //               textContent gives "llms-ctx-full.txt#L1-800" directly
  //   Page chip:  span.opacity-70 inside the chip (NOT the verb, NOT google-symbols)
  //               e.g. "llmstxt.org" / "fastht.ml"

  function chipText(container) {
    const fileSpan = container.querySelector(".inline-flex.break-all.leading-tight");
    if (fileSpan) return (fileSpan.textContent || "").trim();

    // Page chip: find span.opacity-70 that is NOT a google-symbols span
    const opSpans = container.querySelectorAll("span.opacity-70");
    for (const s of opSpans) {
      if (s.classList.contains("google-symbols")) continue;
      if (s.classList.contains("shrink-0")) continue; // verb span, not chip
      const t = (s.textContent || "").trim();
      if (t.length > 1) return t;
    }
    return "";
  }

  // ── Parse the innermost content div of an action row ─────────────────────
  //
  // Three patterns:
  //   "Analyzed"       →  span.shrink-0.opacity-70  +  .flex.items-center.overflow-hidden
  //   "Created/Read"   →  p.opacity-70              +  [data-tooltip-id]
  //   "Ran/Edited"     →  span.opacity-70.mr-*      +  [class*="font-mono"]

  function parseContentDiv(div) {
    if (!div) return null;

    // Analyzed pattern
    const shrinkVerb = div.querySelector("span.shrink-0.opacity-70");
    if (shrinkVerb) {
      const verb = (shrinkVerb.textContent || "").trim();
      const chipContainer = div.querySelector(".flex.items-center.overflow-hidden");
      return { verb, detail: chipContainer ? chipText(chipContainer) : "" };
    }

    // Created outline / Read page pattern
    const pVerb = div.querySelector("p.opacity-70");
    if (pVerb) {
      const verb = (pVerb.textContent || "").trim();
      const chipContainer = div.querySelector("[data-tooltip-id]");
      return { verb, detail: chipContainer ? chipText(chipContainer) : "" };
    }

    // Ran / Edited / Created command pattern
    const opVerb = div.querySelector("span.opacity-70");
    const mono = div.querySelector('[class*="font-mono"]');
    if (opVerb && mono) {
      return {
        verb: (opVerb.textContent || "").trim(),
        detail: (mono.textContent || "").trim(),
      };
    }

    return null;
  }

  // Parse one .flex.flex-row row → action node or null
  function parseFlexRow(row) {
    const truncateDiv = row.querySelector(".truncate");
    const contentDiv = truncateDiv
      ? truncateDiv.firstElementChild || truncateDiv
      : null;
    const parsed = parseContentDiv(contentDiv);
    if (!parsed || (!parsed.verb && !parsed.detail)) return null;
    return {
      role: "action",
      label: parsed.verb,
      detail: parsed.detail,
      html: null,
      children: [],
    };
  }

  // ── Parse "Explored" expanded section ────────────────────────────────────
  //
  // expandedSibling = div.relative immediately after the "Explored" button.
  // Inside: div.overflow-y-auto > div.flex.flex-col
  // Children of that flex-col are ALL div.flex.flex-row, each containing either:
  //   - .isolate  →  thought block
  //   - plain action row content

  function parseExploredContent(expandedSibling) {
    if (!expandedSibling) return [];
    const overflowDiv = expandedSibling.querySelector(".overflow-y-auto");
    const inner = overflowDiv ? overflowDiv.firstElementChild : null;
    if (!inner) return [];

    const children = [];
    let pendingActions = [];

    function flushActions() {
      if (!pendingActions.length) return;
      children.push({
        role: "actions",
        label: "",
        detail: "",
        html: null,
        children: [...pendingActions],
      });
      pendingActions = [];
    }

    for (const row of Array.from(inner.children)) {
      // Each row is div.flex.flex-row wrapping either a .isolate or an action
      const isolate = row.querySelector(".isolate");
      if (isolate) {
        flushActions();
        const btn = isolate.querySelector("button");
        const labelSpan = btn && btn.querySelector("span.cursor-pointer");
        const rawLabel = (
          (labelSpan && labelSpan.textContent) ||
          (btn && btn.textContent) ||
          "Thought"
        ).trim().replace(/\s+/g, " ");
        // Strip the chevron icon text that may leak in
        const label = rawLabel.replace(/chevron_right/g, "").trim();
        const contentDiv = isolate.querySelector("div.leading-relaxed");
        const html = contentDiv ? getHTML(contentDiv) : null;
        const text = contentDiv ? deepText(contentDiv) : "";
        if (label.length > 1 || text || html) {
          children.push({ role: "thought", label, detail: text, html, children: [] });
        }
      } else {
        const action = parseFlexRow(row);
        if (action) pendingActions.push(action);
      }
    }
    flushActions();
    return children;
  }

  // ── Parse "Worked for Xm" expanded section ───────────────────────────────
  //
  // expandedSibling = div.relative immediately after the "Worked for" button.
  // Inside: div.overflow-y-auto > div.flex.flex-col
  // Children:
  //   div.relative   →  "Explored N files, M pages" button + its expanded sibling
  //   div.flex.flex-row  →  Ran / Edited / Created command rows

  function parseWorkedContent(expandedSibling) {
    if (!expandedSibling) return [];
    const overflowDiv = expandedSibling.querySelector(".overflow-y-auto");
    const inner = overflowDiv ? overflowDiv.firstElementChild : null;
    if (!inner) return [];

    const children = [];

    for (const child of Array.from(inner.children)) {
      if (child.classList.contains("relative")) {
        // "Explored N files, M pages" button wrapper
        const btn = Array.from(child.children).find(c => c.tagName === "BUTTON");
        if (!btn) continue;
        const opacity70 = btn.querySelector("span.opacity-70");
        if (!opacity70) continue;
        const verb = (opacity70.textContent || "").trim();
        // Second span holds the count: "3 files, 2 pages"
        const countSpan = Array.from(btn.querySelectorAll("span")).find(
          s =>
            !s.classList.contains("opacity-70") &&
            !s.classList.contains("google-symbols") &&
            (s.textContent || "").trim().length > 0
        );
        const count = countSpan ? (countSpan.textContent || "").trim() : "";
        const label = count ? verb + " " + count : verb;
        const exploredExpanded = btn.nextElementSibling;
        const exploredChildren = parseExploredContent(exploredExpanded);
        children.push({
          role: "explored",
          label,
          detail: "",
          html: null,
          children: exploredChildren,
        });
      } else if (child.classList.contains("flex") && child.classList.contains("flex-row")) {
        // Ran / Edited / Created command rows at the worked level
        const action = parseFlexRow(child);
        if (action) {
          // Promote "action" to "ran" for worked-level rows
          children.push({ ...action, role: "ran" });
        }
      }
    }

    return children;
  }

  // ── Main pass ─────────────────────────────────────────────────────────────

  const nodes = []; // { el, node }
  const seenEls = new WeakSet();

  // 1. User turns
  for (const step of chatRoot.querySelectorAll('[data-testid="user-input-step"]')) {
    if (seenEls.has(step)) continue;
    seenEls.add(step);
    const inner = step.querySelector(".whitespace-pre-wrap");
    if (!inner) continue;
    const text = cleanUserText(inner);
    if (text) {
      nodes.push({
        el: step,
        node: { role: "user", label: text, detail: "", html: null, children: [] },
      });
    }
  }

  // 2. "Worked for Xm" / "Thinking for Xs" blocks
  for (const btn of chatRoot.querySelectorAll("button")) {
    // Must be a direct span.opacity-70 child (not deeply nested)
    const opacity70 = Array.from(btn.children).find(
      c => c.tagName === "SPAN" && c.classList.contains("opacity-70")
    );
    if (!opacity70) continue;
    const labelText = (opacity70.textContent || "").trim();
    if (!/^(Worked|Thinking) for \d/i.test(labelText)) continue;
    if (seenEls.has(btn)) continue;
    seenEls.add(btn);

    const expandedSibling = btn.nextElementSibling;
    const workedChildren = parseWorkedContent(expandedSibling);

    nodes.push({
      el: btn,
      node: {
        role: "worked",
        label: labelText,
        detail: "",
        html: null,
        children: workedChildren,
      },
    });
  }

  // 3. Agent response turns (div.leading-relaxed.select-text NOT inside .isolate)
  for (const el of chatRoot.querySelectorAll("div.leading-relaxed.select-text")) {
    if (el.closest(".isolate")) continue;
    if (seenEls.has(el)) continue;
    seenEls.add(el);
    const text = deepText(el);
    if (!text || text.length < 4) continue;
    const html = getHTML(el);
    nodes.push({
      el,
      node: { role: "agent", label: "", detail: text, html, children: [] },
    });
  }

  // Sort by DOM order
  nodes.sort((a, b) => {
    if (a.el === b.el) return 0;
    return a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING
      ? -1
      : 1;
  });

  return JSON.stringify(nodes.map(n => n.node));
})();
`;