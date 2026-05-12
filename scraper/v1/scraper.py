#!/usr/bin/env python3
"""
scrape_agent_conversation.py
────────────────────────────
Extract an Antigravity IDE agent conversation from its DOM-export HTML
and write a clean Markdown file.

Usage:
    python scrape_agent_conversation.py <dom-export.html> [output.md]

If no output path is given, the script writes <dom-export>.md next to the
input file.

Requirements:
    pip install beautifulsoup4 lxml
"""

import copy
import re
import sys
import textwrap
from pathlib import Path
from dataclasses import dataclass, field
from typing import Literal
from bs4 import BeautifulSoup, Tag, NavigableString


# ── helpers ──────────────────────────────────────────────────────────────────

def squeeze(text: str) -> str:
    """Collapse runs of whitespace / blank lines."""
    text = re.sub(r"\r\n|\r", "\n", text)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def inner_text(tag) -> str:
    """Recursively get readable text, inserting newlines at block elements."""
    if isinstance(tag, NavigableString):
        return str(tag)
    BLOCK = {"p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6",
             "blockquote", "pre", "tr", "br"}
    parts = []
    for child in tag.children:
        t = inner_text(child)
        if getattr(child, "name", None) in BLOCK:
            parts.append(f"\n{t}\n")
        else:
            parts.append(t)
    return "".join(parts)


def code_text(tag) -> str:
    return tag.get_text()


# ── data model ────────────────────────────────────────────────────────────────

@dataclass
class Turn:
    role: Literal["user", "assistant"]
    thinking: str = ""
    work_summary: str = ""
    tool_uses: list = field(default_factory=list)
    content: str = ""


# ── extractor ─────────────────────────────────────────────────────────────────

class ConversationExtractor:

    THINKING_RE  = re.compile(r"thought|thinking|reasoning|plan", re.I)
    WORK_RE      = re.compile(r"worked|duration|elapsed|timing", re.I)
    TOOL_RE      = re.compile(r"tool|explore|analyz|browse|search|file|folder|action", re.I)

    THINK_LABEL  = re.compile(r"^thought\s+for", re.I)
    WORK_LABEL   = re.compile(r"^worked\s+for", re.I)
    TOOL_LABEL   = re.compile(r"^(explored|analyzed|browsed|searched|ran|executed|read)\b", re.I)

    USER_CLS     = re.compile(r"(user|human|prompt|question|input)[\-_]?(message|turn|bubble|chat)?", re.I)
    AGENT_CLS    = re.compile(r"(assistant|agent|model|ai|claude|response|answer|output)[\-_]?(message|turn|bubble|chat)?", re.I)

    def __init__(self, soup: BeautifulSoup):
        self.soup = soup
        self.turns: list[Turn] = []

    def extract(self) -> list[Turn]:
        if self._try_data_role():
            return self.turns
        if self._try_class_heuristics():
            return self.turns
        self._try_structural()
        return self.turns

    # ── strategy 1: data-role / data-turn attributes ──────────────────────────

    def _try_data_role(self) -> bool:
        nodes = self.soup.find_all(attrs={"data-role": True}) or \
                self.soup.find_all(attrs={"data-turn": True})
        if not nodes:
            return False
        for node in nodes:
            role_val = (node.get("data-role") or node.get("data-turn") or "").lower()
            role = "user" if "user" in role_val else "assistant"
            turn = Turn(role=role)
            self._populate_turn(turn, node)
            self.turns.append(turn)
        return bool(self.turns)

    # ── strategy 2: class name heuristics ────────────────────────────────────

    def _try_class_heuristics(self) -> bool:
        seen: set[int] = set()
        candidates: list[tuple[str, Tag]] = []
        for tag in self.soup.find_all(True):
            cls = " ".join(tag.get("class", []))
            if self.USER_CLS.search(cls):
                candidates.append(("user", tag))
            elif self.AGENT_CLS.search(cls):
                candidates.append(("assistant", tag))
        if not candidates:
            return False
        for role, tag in candidates:
            if id(tag) in seen:
                continue
            seen.add(id(tag))
            turn = Turn(role=role)
            self._populate_turn(turn, tag)
            self.turns.append(turn)
        return bool(self.turns)

    # ── strategy 3: structural / alternating children ─────────────────────────

    def _try_structural(self):
        best: Tag | None = None
        best_count = 0
        for tag in self.soup.find_all(["ul", "ol", "div", "section", "main"]):
            direct = [c for c in tag.children if isinstance(c, Tag)]
            if len(direct) > best_count:
                best_count = len(direct)
                best = tag
        if best is None or best_count < 2:
            return
        for i, child in enumerate(c for c in best.children if isinstance(c, Tag)):
            role = "user" if i % 2 == 0 else "assistant"
            turn = Turn(role=role)
            self._populate_turn(turn, child)
            self.turns.append(turn)

    # ── per-turn population ───────────────────────────────────────────────────

    def _is_thinking(self, tag: Tag) -> bool:
        cls = " ".join(tag.get("class", []))
        lbl = tag.get_text(" ", strip=True)
        return bool(self.THINKING_RE.search(cls) or self.THINK_LABEL.match(lbl))

    def _is_work(self, tag: Tag) -> bool:
        cls = " ".join(tag.get("class", []))
        lbl = tag.get_text(" ", strip=True)
        return bool(self.WORK_RE.search(cls) or self.WORK_LABEL.match(lbl))

    def _is_tool(self, tag: Tag) -> bool:
        cls = " ".join(tag.get("class", []))
        lbl = tag.get_text(" ", strip=True)
        return bool(self.TOOL_RE.search(cls) or self.TOOL_LABEL.match(lbl))

    def _populate_turn(self, turn: Turn, node: Tag):
        # Collect special blocks first
        for child in node.find_all(True):
            if self._is_thinking(child) and not turn.thinking:
                turn.thinking = squeeze(inner_text(child))
            elif self._is_work(child) and not turn.work_summary:
                turn.work_summary = child.get_text(" ", strip=True)
            elif self._is_tool(child):
                lbl = child.get_text(" ", strip=True)
                if lbl and lbl not in turn.tool_uses:
                    turn.tool_uses.append(lbl)

        # Build prose from direct children, skipping the special blocks
        prose_parts: list[str] = []
        for child in node.children:
            if not isinstance(child, Tag):
                prose_parts.append(str(child))
                continue
            if self._is_thinking(child) or self._is_work(child) or self._is_tool(child):
                continue
            if child.name in ("pre", "code"):
                prose_parts.append(f"\n```\n{code_text(child)}\n```\n")
            else:
                prose_parts.append(inner_text(child))

        turn.content = squeeze("".join(prose_parts))


# ── markdown renderer ─────────────────────────────────────────────────────────

def turns_to_markdown(turns: list[Turn], source_file: str) -> str:
    out: list[str] = []
    out.append("# Agent Conversation Export\n")
    out.append(f"> Source: `{source_file}`\n")

    for turn in turns:
        if turn.role == "user":
            out.append("## 💬 User\n")
            if turn.content:
                out.append(turn.content + "\n")
        else:
            out.append("## 🤖 Assistant\n")

            if turn.work_summary:
                out.append(f"*{turn.work_summary}*\n")

            if turn.thinking:
                out.append("<details>")
                out.append("<summary>🧠 Thinking</summary>\n")
                out.append(textwrap.indent(turn.thinking, "> "))
                out.append("\n</details>\n")

            if turn.tool_uses:
                out.append("<details>")
                out.append("<summary>🔧 Tool use</summary>\n")
                for t in turn.tool_uses:
                    out.append(f"- {t}")
                out.append("\n</details>\n")

            if turn.content:
                out.append(turn.content + "\n")

        out.append("\n---\n")

    return "\n".join(out)


# ── main ──────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    html_path = Path(sys.argv[1])
    if not html_path.exists():
        print(f"Error: file not found: {html_path}")
        sys.exit(1)

    out_path = Path(sys.argv[2]) if len(sys.argv) > 2 else html_path.with_suffix(".md")

    print(f"Reading  {html_path}")
    html = html_path.read_text(encoding="utf-8", errors="replace")

    print("Parsing DOM …")
    soup = BeautifulSoup(html, "lxml")

    print("Extracting turns …")
    turns = ConversationExtractor(soup).extract()

    if not turns:
        print(
            "⚠  No conversation turns found.\n"
            "   Inspect the HTML and add a matching selector in ConversationExtractor."
        )
        sys.exit(2)

    print(f"Found {len(turns)} turn(s).")
    md = turns_to_markdown(turns, html_path.name)
    out_path.write_text(md, encoding="utf-8")
    print(f"Written  {out_path}")


if __name__ == "__main__":
    main()