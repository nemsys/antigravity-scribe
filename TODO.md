# Antigravity Scribe - Task List

## Immediate Technical Blocks
1. [ ] Extract Brain UUID from past conversations:
   - Current Status: Reverted URL-based lookup (didn't work reliably); falling back to most recently modified folder (mtime).
   - Issue: When a past conversation is loaded in the panel, the URL or React state may not reliably expose the UUID via the current CDP implementation.
   - Goal: Reliable identification of the "Brain" or "Folder" context for historical logs.

## Core Extension Features
1. [ ] Implement robust workspace-level configuration for ANTIGRAVITY_PROFILE_DIR.
2. [ ] Add "Clear Logs" functionality for the local vault.
3. [ ] Improve renderer to support nested tool-call blocks.

## AI & Contributor Readiness
1. [ ] Formalize .agents/ system prompts for external use.
2. [ ] Set up GitHub Action for llms.txt generation.
3. [ ] Automate CHANGELOG.md updates via agent script.

## Done
- [x] Initial extraction logic for DOM trees.
- [x] Basic VSCode Output Channel for diagnostics.
- [x] Integration of scraper.py logic into TypeScript src.