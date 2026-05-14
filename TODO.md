# Antigravity Scribe - Task List

## Immediate Technical Blocks
1. [ ] Extract Brain UUID from past conversations:
   - Current Status: Reverted URL-based lookup (didn't work reliably); falling back to most recently modified folder (mtime).
   - Issue: When a past conversation is loaded in the panel, the URL or React state may not reliably expose the UUID via the current CDP implementation.
   - Goal: Reliable identification of the "Brain" or "Folder" context for historical logs.
2. [ ]  Capture exact model name

## AI & Contributor Readiness
1. [ ] Formalize .agents/ system prompts for external use.
2. [ ] Set up GitHub Action for llms.txt generation.
3. [ ] Automate CHANGELOG.md updates via agent script.
