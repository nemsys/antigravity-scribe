export interface Turn {
  role: string;
  text: string;
  timestamp: string | null;
  seq: number;
}

export const ROLE_ICONS: Record<string, string> = {
  user:      "\u{1F464}",
  thought:   "\u{1F9E0}",
  tool_call: "\u{1F527}",
  agent:     "\u{1F916}",
  unknown:   "\u2753",
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
      return JSON.stringify([{"role":"_no_chat","text":"Chat panel not found"}]);
    }

    function cleanText(el) {
      const clone = el.cloneNode(true);
      clone.querySelectorAll("style, script, link, button, .copy-button").forEach(t => t.remove());
      let txt = (clone.innerText || clone.textContent || "").trim();
      txt = txt.replace(/^(bash|python|terminal|copy|content_copy|alternate_email|check)\s+/i, "");
      txt = txt.replace(/\s+(copy|content_copy|alternate_email|check)$/i, "");
      txt = txt.replace(/\/\*[\s\S]*?\*\//g, "");
      txt = txt.replace(/@media\s*\([^)]*\)\s*\{[\s\S]*?\}\s*\}/g, "");
      txt = txt.replace(/\.[a-zA-Z_-]+\s*\{[^}]*\}/g, "");
      txt = txt.replace(/div:has\([^)]*\)[\s\S]*?(?=\n\n|\n[A-Z]|$)/g, "");
      return txt.trim();
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

    function findTimestamp(el) {
      let p = el.closest('[data-testid*="step"], .isolate, .flex-row, .flex-col, [class*="Turn"]');
      if (!p) p = el.parentElement;
      if (p.hasAttribute('data-timestamp')) return p.getAttribute('data-timestamp');
      const timeEl = p.querySelector('time, [class*="time"], .text-xs, .opacity-50');
      if (timeEl) {
        const t = (timeEl.getAttribute('datetime') || timeEl.innerText || "").trim();
        if (t && t.length < 40) return t;
      }
      return null;
    }

    const items = [];
    const seenFp = new Set();

    function addItem(role, text, el, skipNoise) {
      text = text.replace(/alternate_email\s*content_copy/g, "").trim();
      text = text.replace(/chevron_right/g, "").trim();
      const fp = role + ":" + text.slice(0, 300);
      if (seenFp.has(fp)) return;
      seenFp.add(fp);
      items.push({ el, role, text, timestamp: findTimestamp(el) });
    }

    const NOISE_EXACT = new Set(["Plan", "Send", "mic", "Review Changes", "Accept all", "Reject all", "See all", "Attach", "alternate_email", "content_copy", "python", "text", "Markdown", "Go Live", "Antigravity - Settings", "chevron_right", "Drag a view here to display.", "add", "more_vert", "check"]);
    const NOISE_RE = [/^Ask anything[,.].*@ to mention/is, /^AI may make mistakes/i, /^Gemini \d/i, /^Claude /i, /^(Worked|Thought) for \d/i, /^\d+ Files? With Changes\s*$/, /^[+-]\d+\s*$/, /^\+\d+ -\d+$/, /^Press desired key/i, /^[A-Z][a-zA-Z ]+\n\d+[hm]\s*$/, /^F-\d+\s+LF\s+/, /^AG:\s*\d+-\d+%/, /^\w[\w.-]*\.(py|js|ts|md|json|yaml|sh|txt|css)\s*$/, /^\w[\w.-]*\.(py|js|ts|md|json|yaml|sh|txt|css)\s+\+\d+/, /^border-/, /^margin-/, /^padding-/, /^\{[\s\S]*:\s*[\s\S]*\}/, /^alternate_email\s*content_copy/];
    function isNoise(text, minLen) {
      if (!text || text.length < (minLen || 2)) return true;
      if (NOISE_EXACT.has(text)) return true;
      if (NOISE_RE.some(re => re.test(text))) return true;
      if (/\{[^}]*(?:border|margin|padding|color|font|display)\s*:/i.test(text)) return true;
      return false;
    }
    const originalAddItem = addItem;
    addItem = function(role, text, el, skipNoise) {
      if (!skipNoise && isNoise(text, role === "user" ? 1 : 4)) return;
      originalAddItem(role, text, el, skipNoise);
    };

    for (const step of chatRoot.querySelectorAll('[data-testid="user-input-step"]')) {
      const inner = step.querySelector(".whitespace-pre-wrap");
      if (inner) addItem("user", cleanText(inner), step);
    }
    for (const el of chatRoot.querySelectorAll("div.leading-relaxed.select-text")) {
      const text = cleanText(el);
      if (!text) continue;
      const isThought = el.classList.contains("opacity-70") || el.className.includes("opacity-70");
      addItem(isThought ? "thought" : "agent", text, el);
    }
    const THOUGHT_RE = /^Thought for \d/i;
    for (const btn of chatRoot.querySelectorAll("button")) {
      const btnText = (btn.innerText || "").trim().replace(/\n/g, " ");
      if (!THOUGHT_RE.test(btnText)) continue;
      const isolate = btn.closest(".isolate");
      if (!isolate) continue;
      const hiddenDiv = isolate.querySelector(".overflow-hidden");
      if (!hiddenDiv) continue;
      const cs = hiddenDiv.className || "";
      if (cs.includes("max-h-0") || cs.includes("opacity-0")) {
        const text = deepText(hiddenDiv);
        if (text && text.length > 4) addItem("thought", text, hiddenDiv);
      }
    }
    for (const btn of chatRoot.querySelectorAll("button")) {
      const t = (btn.innerText || "").trim().replace(/\n/g, " ");
      if (/^(Explored|Ran|Viewed|Analyzed|Created|Edited|Searched|Generated|Navigat)/i.test(t)) {
        let detail = t;
        let next = btn.nextElementSibling || btn.parentElement.nextElementSibling;
        const code = (next && next.querySelector('pre, code, .font-mono')) || btn.parentElement.querySelector('pre, code, .font-mono');
        if (code) {
          const fullText = cleanText(code);
          if (fullText && fullText.length > 5) detail = t + ":\n" + fullText;
        }
        addItem("tool_call", detail, btn, true);
      }
    }
    for (const el of chatRoot.querySelectorAll(".flex.items-baseline")) {
      const t = (el.innerText || "").trim().replace(/\n/g, " ");
      if (/^(Ran |Viewed |Edited )/.test(t)) addItem("tool_call", t, el, true);
    }
    for (const el of chatRoot.querySelectorAll(".inline-flex.break-all.leading-tight.select-text, .inline-flex.leading-tight.select-text")) {
      const t = cleanText(el);
      if (t && t.length > 2 && (t.includes("/") || t.includes("."))) addItem("tool_call", t, el, true);
    }
    items.sort((a, b) => {
      if (a.el === b.el) return 0;
      return (a.el.compareDocumentPosition(b.el) & Node.DOCUMENT_POSITION_FOLLOWING) ? -1 : 1;
    });
    return JSON.stringify(items.map((item, idx) => ({ role: item.role, text: item.text, timestamp: item.timestamp, seq: idx })));
})();
`;
