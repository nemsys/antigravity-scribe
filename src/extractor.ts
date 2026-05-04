export interface Turn {
  role: string;
  text: string;
  html: string | null;   // raw innerHTML for agent/thought turns (used for MD conversion)
  seq: number;
}

export const ROLE_ICONS: Record<string, string> = {
  user: "\u{1F464}",
  thought: "\u{1F9E0}",
  tool_call: "\u{1F527}",
  agent: "\u{1F916}",
  unknown: "\u2753",
};

// ---------------------------------------------------------------------------
// EXTRACT_JS — verbatim from ag-snap.py
// ---------------------------------------------------------------------------
export const EXTRACT_JS = String.raw`
(function () {
  "use strict";

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
      '[aria-label*="Ask anything"]'
    ]) {
      const el = document.querySelector(sel);
      if (el) { const c = containerOf(el); if (c) return c; }
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.innerText || "").trim();
      if (t === "Ask anything, @ to mention, / for workflows" && !node.children.length) {
        const c = containerOf(node);
        if (c) return c;
      }
    }
    return null;
  }

  const chatRoot = findChatRoot();
  if (!chatRoot) {
    return JSON.stringify([{"role":"_no_chat","text":"Chat panel not found","html":null}]);
  }

  function cleanText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll(
      "style, script, link, button, .copy-button, [data-testid='revert-button'], .google-symbols, svg"
    ).forEach(t => t.remove());
    let txt = (clone.innerText || clone.textContent || "").trim();
    txt = txt.replace(/^(bash|python|terminal|copy|content_copy|alternate_email|check)\s+/i, "");
    txt = txt.replace(/\s+(copy|content_copy|alternate_email|check)$/i, "");
    txt = txt.replace(/\/\*[\s\S]*?\*\//g, "");
    txt = txt.replace(/@media\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\}/g, "");
    txt = txt.replace(/\.[a-zA-Z_-]+\s*\{[^}]*\}/g, "");
    txt = txt.replace(/div:has\([^)]*\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, "");
    return txt.trim();
  }

  function getHTML(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("style, script, link").forEach(t => t.remove());
    clone.querySelectorAll("[node]").forEach(t => t.removeAttribute("node"));
    return clone.innerHTML.trim();
  }

  function deepText(el) {
    const clone = el.cloneNode(true);
    clone.querySelectorAll("style, script, link").forEach(t => t.remove());
    let txt = (clone.textContent || "").trim();
    txt = txt.replace(/\/\*[\s\S]*?\*\//g, "");
    txt = txt.replace(/@media\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\}/g, "");
    txt = txt.replace(/\.[a-zA-Z_-]+\s*\{[^}]*\}/g, "");
    return txt.trim();
  }

  const items = [];
  const seenFp = new Set();

  function addItem(role, text, html, el, skipNoise) {
    text = (text || "").replace(/alternate_email\s*content_copy/g, "").trim();
    text = text.replace(/chevron_right/g, "").trim();
    if (!text) return;
    const fp = role + ":" + text.slice(0, 300);
    if (seenFp.has(fp)) return;
    seenFp.add(fp);
    items.push({ el, role, text, html: html || null });
  }

  const NOISE_EXACT = new Set(["Plan", "Send", "mic", "Review Changes", "Accept all", "Reject all",
    "See all", "Attach", "alternate_email", "content_copy", "python", "text", "Markdown",
    "Go Live", "Antigravity - Settings", "chevron_right", "Drag a view here to display.",
    "add", "more_vert", "check", "undo"]);
  const NOISE_RE = [
    /^Ask anything[,.].*@ to mention/is, /^AI may make mistakes/i, /^Gemini \d/i, /^Claude /i,
    /^\d+ Files? With Changes\s*$/, /^[+-]\d+\s*$/, /^\+\d+ -\d+$/,
    /^Press desired key/i, /^[A-Z][a-zA-Z ]+\n\d+[hm]\s*$/, /^F-\d+\s+LF\s+/,
    /^AG:\s*\d+-\d+%/,
    /^\w[\w.-]*\.(py|js|ts|md|json|yaml|sh|txt|css)\s*$/,
    /^\w[\w.-]*\.(py|js|ts|md|json|yaml|sh|txt|css)\s+\+\d+/,
    /^border-/, /^margin-/, /^padding-/,
    /^\{[\s\S]*:\s*[\s\S]*\}/, /^alternate_email\s*content_copy/
  ];
  function isNoise(text, minLen) {
    if (!text || text.length < (minLen || 2)) return true;
    if (NOISE_EXACT.has(text)) return true;
    if (NOISE_RE.some(re => re.test(text))) return true;
    if (/\{[^}]*(?:border|margin|padding|color|font|display)\s*:/i.test(text)) return true;
    return false;
  }

  // ── User turns ─────────────────────────────────────────────────────────────
  for (const step of chatRoot.querySelectorAll('[data-testid="user-input-step"]')) {
    const inner = step.querySelector(".whitespace-pre-wrap");
    if (!inner) continue;
    const text = cleanText(inner);
    if (!isNoise(text, 1)) addItem("user", text, null, step);
  }

  // ── "Worked for Xs" turn summaries + nested tool calls + thoughts ──────────
  for (const btn of chatRoot.querySelectorAll("button")) {
    const spans = btn.querySelectorAll("span.opacity-70");
    if (!spans.length) continue;
    const label = (spans[0].innerText || "").trim();
    if (!/^(Worked|Thinking) for \d/i.test(label)) continue;

    // Capture "Worked for Xs" as a tool_call summary
    addItem("tool_call", label, null, btn, true);

    // Capture nested tool action buttons inside the expanded section
    const expandedSection = btn.nextElementSibling;
    if (!expandedSection) continue;

    // Nested tool calls (Explored, Ran, Viewed, etc.)
    for (const inner of expandedSection.querySelectorAll("button")) {
      const t = (inner.innerText || "").trim().replace(/\n/g, " ").replace(/\s+/g, " ");
      if (/^(Explored|Ran|Viewed|Analyzed|Created|Edited|Searched|Generated|Navigat)/i.test(t)) {
        // Get detail from code block if available
        let detail = t.replace(/chevron_right/g, "").trim();
        const code = inner.nextElementSibling && inner.nextElementSibling.querySelector("pre, code, .font-mono");
        if (code) {
          const codeText = cleanText(code);
          if (codeText && codeText.length > 5) detail = t + ":\n" + codeText;
        }
        addItem("tool_call", detail, null, inner, true);
      }
    }

    // Expanded thoughts inside .isolate divs
    for (const isolate of expandedSection.querySelectorAll(".isolate")) {
      const thoughtBtn = isolate.querySelector("button");
      if (!thoughtBtn) continue;
      const btnText = (thoughtBtn.innerText || "").trim().replace(/\n/g, " ");
      if (!/^Thought for \d/i.test(btnText)) continue;

      // Both expanded (opacity-100) and collapsed (opacity-0/max-h-0) thoughts
      const thoughtContent = isolate.querySelector(".overflow-hidden");
      if (!thoughtContent) continue;

      // Get the leading-relaxed div inside
      const contentDiv = thoughtContent.querySelector("div.leading-relaxed");
      if (contentDiv) {
        const text = deepText(contentDiv);
        if (text && text.length > 4) {
          const html = getHTML(contentDiv);
          addItem("thought", text, html, contentDiv, true);
        }
      } else {
        // Fallback: use deepText on the whole overflow div
        const text = deepText(thoughtContent);
        if (text && text.length > 4) addItem("thought", text, null, thoughtContent, true);
      }
    }
  }

  // ── Agent response turns ───────────────────────────────────────────────────
  // Only top-level agent responses — NOT the ones inside "Worked for" sections
  for (const el of chatRoot.querySelectorAll("div.leading-relaxed.select-text")) {
    // Skip if inside a "Worked for" collapse (those are thoughts, handled above)
    if (el.closest(".isolate")) continue;
    const text = cleanText(el);
    if (!text || isNoise(text, 4)) continue;
    const html = getHTML(el);
    addItem("agent", text, html, el);
  }

  // ── Inline tool call paths (.agents/..., file paths, etc.) ────────────────
  for (const el of chatRoot.querySelectorAll(".inline-flex.break-all.leading-tight.select-text, .inline-flex.leading-tight.select-text")) {
    const t = cleanText(el);
    if (t && t.length > 2 && (t.includes("/") || t.includes("."))) {
      addItem("tool_call", t, null, el, true);
    }
  }

  items.sort((a, b) => {
    if (a.el === b.el) return 0;
    return (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
  });

  return JSON.stringify(items.map((item, idx) => ({
    role: item.role,
    text: item.text,
    html: item.html,
    seq: idx
  })));
})();
`;/**
 * Extract the conversation title from the Antigravity chat panel header.
 * Targets the title div inside .antigravity-agent-side-panel.
 */
export const EXTRACT_TITLE_JS = `(function() {
  const panel = document.querySelector('.antigravity-agent-side-panel');
  if (!panel) return null;
  const titleEl = panel.querySelector('.flex.min-w-0.items-center.overflow-hidden.text-ellipsis.whitespace-nowrap');
  if (!titleEl) return null;
  const t = (titleEl.innerText || titleEl.textContent || "").trim();
  if (t && t.length > 2 && t.length < 120) return t;
  return null;
})();`;