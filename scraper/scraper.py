#!/usr/bin/env python3
"""
Scraper for Antigravity IDE agent side panel DOM exports.

Extracts user–agent conversations from cleaned HTML DOM files
and outputs Obsidian-compatible Markdown.

Usage:
    python scraper.py <input.html> [output.md]

If output is omitted, prints to stdout.
"""

import sys
import re
import html
from pathlib import Path

try:
    from bs4 import BeautifulSoup, NavigableString, Tag
except ImportError:
    print("ERROR: beautifulsoup4 is required. Install with: pip install beautifulsoup4", file=sys.stderr)
    sys.exit(1)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _cs(el: Tag) -> str:
    c = el.get("class", [])
    return " ".join(c) if isinstance(c, list) else str(c)


def clean(text: str) -> str:
    if not text:
        return ""
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def get_text(el) -> str:
    if el is None:
        return ""
    return clean(_walk_text(el))


def _walk_text(el: Tag) -> str:
    parts = []
    for child in el.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
        elif isinstance(child, Tag):
            if child.name in ("svg", "style", "script"):
                continue
            cs = _cs(child)
            st = child.get("style", "")
            if "visibility: hidden" in st or "display: none" in st:
                continue
            if "hidden" in cs.split() and "group-hover:" not in cs:
                continue
            if "animate-spin" in cs:
                continue
            parts.append(_walk_text(child))
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Rich content → Markdown
# ---------------------------------------------------------------------------

def to_md(el: Tag, depth: int = 0) -> str:
    if el is None:
        return ""
    parts = []
    for child in el.children:
        if isinstance(child, NavigableString):
            parts.append(str(child))
            continue
        if not isinstance(child, Tag):
            continue
        tag = child.name
        if tag in ("svg", "style", "script"):
            continue
        cs = _cs(child)
        st = child.get("style", "")
        if "visibility: hidden" in st or "display: none" in st:
            continue
        if "hidden" in cs.split() and "group-hover:" not in cs:
            continue
        if "animate-spin" in cs:
            continue

        if tag == "code":
            parts.append(f"`{clean(child.get_text())}`")
        elif tag in ("strong", "b"):
            parts.append(f"**{clean(to_md(child, depth))}**")
        elif tag in ("em", "i"):
            parts.append(f"*{clean(to_md(child, depth))}*")
        elif tag == "a":
            href = child.get("href", "")
            inner = clean(to_md(child, depth))
            parts.append(f"[{inner}]({href})" if href else inner)
        elif tag == "p":
            inner = clean(to_md(child, depth))
            if inner:
                parts.append(f"\n\n{inner}\n")
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            lvl = int(tag[1])
            inner = clean(to_md(child, depth))
            parts.append(f"\n\n{'#' * lvl} {inner}\n")
        elif tag == "br":
            parts.append("\n")
        elif tag == "ul":
            items = child.find_all("li", recursive=False)
            lp = [f"{'  ' * depth}- {clean(to_md(it, depth + 1))}" for it in items]
            parts.append("\n" + "\n".join(lp) + "\n")
        elif tag == "ol":
            items = child.find_all("li", recursive=False)
            lp = [f"{'  ' * depth}{i}. {clean(to_md(it, depth + 1))}" for i, it in enumerate(items, 1)]
            parts.append("\n" + "\n".join(lp) + "\n")
        elif tag == "li":
            parts.append(to_md(child, depth))
        elif tag == "pre":
            parts.append(f"\n\n{_code_block(child)}\n")
        elif tag == "img":
            alt = child.get("alt", "image")
            src = child.get("src", "")
            w = child.get("width", "")
            if w and w.replace("px", "").isdigit() and int(w.replace("px", "")) <= 16:
                continue
            parts.append(f"![{alt}]({src})")
        else:
            parts.append(to_md(child, depth))

    return re.sub(r"\n{3,}", "\n\n", "".join(parts))


def _code_block(pre: Tag) -> str:
    lang_el = pre.select_one(".font-sans.text-sm")
    lang = lang_el.get_text(strip=True) if lang_el else ""
    lcd = pre.select(".code-line .line-content")
    if lcd:
        code = "\n".join(l.get_text() for l in lcd)
    else:
        area = pre.select_one(".p-3") or pre
        code = area.get_text()
    return f"```{lang}\n{code.strip()}\n```"


# ---------------------------------------------------------------------------
# Structural parsers
# ---------------------------------------------------------------------------

def _btn_parts(btn: Tag) -> tuple[str, str]:
    spans = btn.find_all("span", recursive=False)
    verb = detail = ""
    for sp in spans:
        cs = _cs(sp)
        if "google-symbols" in cs:
            continue
        t = get_text(sp)
        if not t:
            continue
        if "opacity-70" in cs or "cursor-pointer" in cs:
            verb = t
        else:
            detail = t
    return verb, detail


def _parse_user(step: Tag) -> str:
    parts = []
    for img in step.select("img"):
        alt = img.get("alt", "image")
        src = img.get("src", "")
        w = img.get("width", "")
        if w and w.replace("px", "").isdigit() and int(w.replace("px", "")) <= 16:
            continue
        parts.append(f"![{alt}]({'embedded-image' if src.startswith('data:') else src})")

    td = step.select_one("div.whitespace-pre-wrap.text-sm")
    if td:
        tp = []
        for ch in td.children:
            if isinstance(ch, NavigableString):
                tp.append(str(ch))
            elif isinstance(ch, Tag):
                if "context-scope-mention" in _cs(ch):
                    tp.append(f"@[{clean(ch.get_text())}]")
                else:
                    tp.append(ch.get_text())
        parts.append(clean("".join(tp)))
    return "\n".join(parts)


def _parse_thought(isolate: Tag) -> str:
    btn = isolate.select_one("button")
    sp = btn.select_one("span.cursor-pointer") if btn else None
    header = get_text(sp) if sp else (get_text(btn) if btn else "Thought")

    cdiv = isolate.select_one("div.overflow-hidden.transition-all")
    content = ""
    if cdiv:
        md = cdiv.select_one("div.leading-relaxed")
        if md:
            content = clean(to_md(md))

    entry = f"💭 {header}"
    if content:
        entry += f"\n> {content}"
    return entry


def _parse_analyzed(row: Tag) -> str:
    label = row.select_one("span.shrink-0.opacity-70")
    action = get_text(label) if label else ""
    mention = row.select_one("span.inline-flex.break-all")
    fname = get_text(mention) if mention else ""
    if fname:
        return f"{action} `{fname}`" if action else f"`{fname}`"
    return action


def _parse_ran(row: Tag) -> str:
    sp = row.select_one("span.font-mono")
    return f"`{clean(sp.get_text())}`" if sp else ""


def _parse_artifact(card: Tag) -> str:
    ts = card.select_one("span.inline-flex.break-all")
    title = get_text(ts) if ts else ""
    ds = card.select_one("span.text-sm.opacity-70.line-clamp-3")
    desc = get_text(ds) if ds else ""
    r = f"📄 **{title}**"
    if desc:
        r += f"\n> {desc}"
    return r


def _parse_files_modified(section: Tag) -> str:
    fms = section.select("span.inline-flex.break-all")
    parts = ["**Files Modified:**"]
    for fm in fms:
        t = get_text(fm)
        if t:
            parts.append(f"- `{t}`")
    return "\n".join(parts) if len(parts) > 1 else ""


def _parse_search_item(row: Tag) -> str:
    """Parse a Searched/Analyzed action row.

    DOM shape (inside an Explored expanded block):
        <div class="flex flex-row">
          ...deep nesting...
            <div class="flex items-center gap-1 ...">
              <span class="opacity-70">Searched</span>
              <span class="overflow-hidden text-ellipsis ...">asset</span>
              <span class="shrink-0 rounded-full ...">4 results</span>
    """
    # Gather all spans in the row (deepest ones carry the data)
    spans = row.select("span")
    action = query = count = ""
    for sp in spans:
        cs = _cs(sp)
        t = clean(sp.get_text())
        if not t:
            continue
        if "google-symbols" in cs:
            continue
        if not action and "opacity-70" in cs:
            action = t
        elif not count and "rounded-full" in cs:
            count = t
        elif not query:
            query = t
    parts = [p for p in (action, f"`{query}`" if query else "", count) if p]
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Step walker — recursively walks the expanded content tree
# ---------------------------------------------------------------------------

def _walk(container: Tag, indent: int = 0) -> list[str]:
    items = []
    if container is None:
        return items
    pad = "  " * indent

    for child in container.children:
        if not isinstance(child, Tag):
            continue
        cs = _cs(child)

        # Thought blocks (.isolate with Thought button)
        if "isolate" in cs.split():
            btn = child.select_one("button")
            if btn and "Thought for" in get_text(btn):
                items.append(pad + _parse_thought(child))
            continue

        # Action buttons: div.relative with Explored/Edited button
        if child.name == "div" and "relative" in cs.split():
            btn = child.select_one(":scope > button")
            if btn:
                v, d = _btn_parts(btn)
                if v in ("Explored", "Edited"):
                    items.append(f"{pad}📂 {v} {d}".rstrip())
                    # expanded children (div.relative child with opacity: 1)
                    exp = child.select_one(":scope > div[style*='opacity: 1']")
                    if exp:
                        items.extend(_walk(exp, indent + 1))
            else:
                # no button — might be a container wrapping sub-items
                items.extend(_walk(child, indent))
            continue

        # Ran commands
        if child.name == "div" and "flex-row" in cs:
            ran_sp = child.select_one("span.opacity-70")
            if ran_sp and "Ran" in get_text(ran_sp):
                cmd = _parse_ran(child)
                items.append(f"{pad}⚡ Ran {cmd}")
                continue

            # Searched / Analyzed / other action items
            # (span.opacity-70 present but not "Ran" — e.g. "Searched", "Analyzed")
            if ran_sp:
                txt = _parse_search_item(child)
                if txt:
                    items.append(f"{pad}🔍 {txt}")
                continue

            # Analyzed items (legacy: span with both shrink-0 and opacity-70)
            al = child.select_one("span.shrink-0.opacity-70")
            if al:
                txt = _parse_analyzed(child)
                if txt:
                    items.append(f"{pad}🔍 {txt}")
                continue

            # Folder-style analyzed
            ad = child.select_one("[class*='cursor-pointer'][class*='rounded-lg']")
            if ad:
                txt = _parse_analyzed(ad)
                if txt:
                    items.append(f"{pad}🔍 {txt}")
                # sub items in folder expansion
                sub_c = child.select_one("div.overflow-hidden.pl-3")
                if sub_c:
                    for sr in sub_c.select("div.flex.flex-row"):
                        st2 = _parse_analyzed(sr)
                        if st2:
                            items.append(f"{pad}  🔍 {st2}")
                continue

        # Response text blocks
        if child.name == "div" and "px-2" in cs and "py-1" in cs:
            md = child.select_one("div.leading-relaxed")
            if md:
                t = clean(to_md(md))
                if t and len(t) > 3:
                    items.append(pad + t)
            continue

        # Recurse into any unmatched div container
        # (covers wrapper divs like overflow-y-auto, flex-col, gap containers, etc.)
        if child.name == "div":
            items.extend(_walk(child, indent))

    return items


# ---------------------------------------------------------------------------
# Turn parser
# ---------------------------------------------------------------------------

def parse_turn(turn_div: Tag) -> dict:
    result = {"user_message": "", "agent_sections": [], "timestamp": ""}

    group = turn_div.select_one("div.flex.flex-col.group.w-full") or turn_div

    # User message
    us = group.select_one("[data-testid='user-input-step']")
    if us:
        result["user_message"] = _parse_user(us)

    for child in group.children:
        if not isinstance(child, Tag):
            continue
        cs = _cs(child)

        # Skip sticky header
        if "sticky" in cs:
            continue

        # Timestamp
        if "pt-3" in cs:
            ts = child.select_one("span.text-xs")
            if ts:
                t = get_text(ts)
                if t and ("AM" in t or "PM" in t):
                    result["timestamp"] = t
            continue

        # Artifact cards (flex-col gap-1.5 py-1 containing border cards)
        cards = child.select("div.border.p-2")
        if cards:
            for card in cards:
                am = _parse_artifact(card)
                if am:
                    result["agent_sections"].append(am)
            if not child.select("div.leading-relaxed.select-text"):
                continue

        # Files Modified
        fl = child.select_one("span.text-sm.opacity-70")
        if fl and "Files Modified" in get_text(fl):
            fm = _parse_files_modified(child)
            if fm:
                result["agent_sections"].append(fm)
            continue

        # --- Detect "Worked for" or standalone content ---
        # In the DOM, the wrapper <div> (with no class or class="") contains:
        #   1. <div class="relative"> with <button>Worked for X</button>
        #      Inside that div.relative, there's also a child:
        #        <div class="relative" style="opacity: 1"> containing expanded steps
        #   2. <div class="px-2 py-1"> with response text
        #
        # OR for standalone thought (no Worked wrapper):
        #   <div> containing <div class="flex flex-col gap-0.5"> with isolate+thought

        # Find Worked button
        worked_btn = None
        worked_btn_container = None  # the div.relative that holds the button

        # Check direct child divs for a "Worked for" button
        for sub in child.children:
            if not isinstance(sub, Tag):
                continue
            sub_cs = _cs(sub)
            if sub.name == "div" and "relative" in sub_cs.split():
                btn = sub.select_one(":scope > button")
                if btn:
                    v, d = _btn_parts(btn)
                    if "Worked" in v:
                        worked_btn = btn
                        worked_btn_container = sub
                        label = f"{v} {d}".strip()
                        result["agent_sections"].append(f"⏱️ **{label}**")
                        break
            # Also check if the div.relative is deeper
            elif sub.name == "div":
                inner_rel = sub.select_one(":scope > div.relative > button")
                if inner_rel:
                    v, d = _btn_parts(inner_rel)
                    if "Worked" in v:
                        worked_btn = inner_rel
                        worked_btn_container = inner_rel.parent
                        label = f"{v} {d}".strip()
                        result["agent_sections"].append(f"⏱️ **{label}**")
                        break

        if worked_btn_container:
            # The expanded content is a CHILD of the worked_btn_container:
            # <div class="relative" style="opacity: 1; ..."> inside worked_btn_container
            exp = worked_btn_container.select_one(":scope > div[style*='opacity: 1']")
            if exp:
                result["agent_sections"].extend(_walk(exp))
            else:
                # Fallback: try any child div that's not the button itself
                for c2 in worked_btn_container.children:
                    if isinstance(c2, Tag) and c2 != worked_btn and c2.name != "button":
                        result["agent_sections"].extend(_walk(c2))

            # Also collect response text that follows the Worked block
            # (siblings of worked_btn_container inside child)
            found_wbc = False
            for sib in child.children:
                if not isinstance(sib, Tag):
                    continue
                if sib == worked_btn_container:
                    found_wbc = True
                    continue
                if found_wbc:
                    sib_cs = _cs(sib)
                    if "px-2" in sib_cs and "py-1" in sib_cs:
                        md = sib.select_one("div.leading-relaxed")
                        if md:
                            t = clean(to_md(md))
                            if t and len(t) > 3:
                                result["agent_sections"].append(t)
            continue

        # Standalone thought (no Worked wrapper)
        iso = child.select_one("div.isolate")
        if iso:
            btn = iso.select_one("button")
            if btn and "Thought for" in get_text(btn):
                result["agent_sections"].append(_parse_thought(iso))
                # Also get response text in the same container
                for sib_ch in child.select("div.px-2.py-1"):
                    md = sib_ch.select_one("div.leading-relaxed")
                    if md:
                        t = clean(to_md(md))
                        if t and len(t) > 3:
                            result["agent_sections"].append(t)
                continue

        # Standalone response text
        mds = child.select("div.leading-relaxed.select-text")
        for md in mds:
            p = md.parent
            skip = False
            while p and p != child:
                if "opacity-0" in _cs(p):
                    skip = True
                    break
                p = p.parent
            if skip:
                continue
            t = clean(to_md(md))
            if t and len(t) > 3:
                result["agent_sections"].append(t)

    return result


# ---------------------------------------------------------------------------
# Top-level scraper
# ---------------------------------------------------------------------------

def scrape(html_content: str) -> str:
    soup = BeautifulSoup(html_content, "html.parser")

    title = ""
    td = soup.select_one("div.flex.min-w-0.items-center.overflow-hidden.text-ellipsis.whitespace-nowrap")
    if td:
        title = clean(td.get_text())

    model = ""
    mb = soup.select_one("button[aria-label^='Select model']")
    if mb:
        ms = mb.select_one("span.min-w-0")
        if ms:
            model = get_text(ms)

    conv = soup.select_one("#conversation")
    turns = []
    if conv:
        for td_el in conv.select("div.relative.flex.flex-col.gap-y-3 > div.flex.items-start"):
            turn = parse_turn(td_el)
            if turn["user_message"] or turn["agent_sections"]:
                turns.append(turn)

    md = []
    md.append("---")
    if title:
        md.append(f'title: "{title}"')
    if model:
        md.append(f'model: "{model}"')
    md.append(f"turns: {len(turns)}")
    md.append("tags:")
    md.append("  - agent-session")
    md.append("  - antigravity")
    md.append("---")
    md.append("")

    if title:
        md.append(f"# {title}")
        md.append("")

    for i, turn in enumerate(turns, 1):
        if turn["user_message"]:
            md.append("## 👤 User")
            md.append("")
            md.append(turn["user_message"])
            md.append("")

        if turn["agent_sections"]:
            md.append("## 🤖 Agent")
            md.append("")
            for s in turn["agent_sections"]:
                md.append(s)
                md.append("")

        if turn["timestamp"]:
            md.append(f"*{turn['timestamp']}*")
            md.append("")

        if i < len(turns):
            md.append("---")
            md.append("")

    return "\n".join(md)


def main():
    if len(sys.argv) < 2:
        print(f"Usage: {sys.argv[0]} <input.html> [output.md]", file=sys.stderr)
        sys.exit(1)

    inp = Path(sys.argv[1])
    if not inp.exists():
        print(f"ERROR: File not found: {inp}", file=sys.stderr)
        sys.exit(1)

    html_content = inp.read_text(encoding="utf-8")
    markdown = scrape(html_content)

    if len(sys.argv) >= 3:
        out = Path(sys.argv[2])
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(markdown, encoding="utf-8")
        print(f"✅ Written to {out}", file=sys.stderr)
    else:
        print(markdown)


if __name__ == "__main__":
    main()