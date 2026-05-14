# Antigravity Scribe

> **Capture agents thinking, tool calls & artifacts to your Obsidian vault**

Antigravity Scribe is a VS Code extension for [Google Antigravity IDE](https://antigravity.google) that captures the full content of an agent session — chat turns, thinking blocks, tool calls, task lists, and implementation plans — and writes a single structured Markdown note directly into your Obsidian vault.

No copy-pasting. No manual logging. Run the capture when your session is done and the note appears.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Requirements](#requirements)
- [Installation](#installation)
- [Configuration](#configuration)
- [Getting Started](#getting-started)
- [Commands](#commands)
- [Output Format](#output-format)
- [Artifact Matching](#artifact-matching)
- [Custom Antigravity Profiles](#custom-antigravity-profiles)
- [Troubleshooting](#troubleshooting)
- [Building from Source](#building-from-source)

---

## How It Works

Antigravity Scribe uses two data sources and combines them into one note:

**1. Chrome DevTools Protocol (CDP)**
Connects to Antigravity's built-in Chromium process via a local debug port and extracts the full conversation from the DOM. 

*   **Auto-Scroll & Expand:** The extension automatically scrolls the chat panel to mount lazy-loaded messages and clicks to expand all "Worked for", "Thought for", and "Explored" blocks to ensure no content is missed.
*   **Rich Conversion:** Extracts user messages, agent responses, thinking blocks (with inner HTML to Markdown conversion), tool call summaries, and command runs.

**2. Brain directory (filesystem)**
Antigravity writes its verifiable artifacts (`task.md`, `implementation_plan.md`) to a local `brain/` directory. The extension identifies the active session and includes the artifact content in the note.

Both sources are combined into a single Obsidian-native Markdown note with YAML frontmatter and linked artifacts.

---

## Requirements

- **Google Antigravity IDE** — [download here](https://antigravity.google)
- **Antigravity must be launched with the CDP debug port enabled** (see [Getting Started](#getting-started))
- **An Obsidian vault** — the extension writes notes into it directly
- **Node.js ≥ 18** — needed only if building from source
- **VS Code ≥ 1.85** or any Antigravity version (it is a VS Code fork)

---

## Installation

### Option A — Install from `.vsix` (recommended)

1. Download `antigravity-scribe-0.1.0.vsix` from the [releases page](https://github.com/nemsys/antigravity-scribe/releases).

2. Open Antigravity (or VS Code).

3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
   ```
   Extensions: Install from VSIX...
   ```

4. Select the downloaded `.vsix` file.

5. Reload the window when prompted.

---

## Configuration

Open Settings (`Ctrl+,`) and search for **Antigravity Scribe**, or add these keys to your `settings.json`:

```jsonc
{ 
  // Required if you use a custom Antigravity profile (see below)
  "agscribe.brainPath": "~/.gemini/antigravity/brain",

   // Required — path to your Obsidian vault root
  "agscribe.vaultPath": "/home/yourname/Obsidian/Vault",

  // Folder inside the vault where session notes are written
  "agscribe.vaultFolder": "AgentSessions",

  // CDP port Antigravity is listening on (default 9222)
  "agscribe.port": 9222,

  // Open the captured note in the editor immediately after capture
  "agscribe.openAfterCapture": true
}
```

---

## Getting Started

### Step 1 — Launch Antigravity with CDP enabled

Antigravity Scribe connects to Antigravity via the Chrome DevTools Protocol. You must start Antigravity with the debug port flag.

**Linux / macOS:**
```bash
antigravity --remote-debugging-port=9222
```

**If you use a launcher script or `.desktop` entry**, add the flag to the `Exec=` line:
```ini
Exec=/usr/bin/antigravity --remote-debugging-port=9222 %F
```

---

### Step 2 — Verify the setup with diagnostics

Before your first real capture, run:

```
Antigravity Scribe: Diagnose Connection
```

You should see:
```
=== Antigravity Scribe Diagnostics ===

✅ CDP port 9222: Antigravity - my-project
✅ Brain path:    /home/yourname/.gemini/antigravity/brain
   Active brain UUID: 50fa0573-52e0-4755-96f4-c98d1e808133
✅ Vault path:    /home/yourname/Obsidian/Vault
```

---

### Step 3 — Capture

When ready, choose one of:

| Method                                                               | When to use                                           |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| Click **$(device-camera) AG Scribe** in the status bar               | Quick capture, reuses the last task label             |
| Command Palette → `Antigravity Scribe: Capture Session (named task)` | When you want to give this session a meaningful label |

---

## Commands

| Command                                            | Description                                                 |
| -------------------------------------------------- | ----------------------------------------------------------- |
| `Antigravity Scribe: Capture Session`              | Capture using the last-used task label (default: `session`) |
| `Antigravity Scribe: Capture Session (named task)` | Prompt for a label, then capture                            |
| `Antigravity Scribe: Open Sessions in Vault`       | Reveal the sessions folder in the Explorer sidebar          |
| `Antigravity Scribe: Diagnose Connection`          | Check CDP, brain path, and vault config                     |

---

## Output Format

The extension generates a structured Markdown file in your vault with:
- **YAML Frontmatter:** Date, time, workspace path, and brain UUID.
- **Artifacts:** Content of `task.md` and `implementation_plan.md` from the brain directory.
- **Session:** Full conversation history including thinking, tool usage, and agent responses.

---

## Artifact Matching

The extension finds the active session by selecting the **most recently modified UUID directory** in your `agscribe.brainPath`. Since Antigravity writes to this directory continuously during a session, the "hottest" directory is reliably the current one.

The `.resolved` versions of artifacts are preferred, as they contain the final, comment-resolved content.

---

## Custom Antigravity Profiles

If you launch Antigravity with `--user-data-dir` pointing to a custom location, you will need to point `agscribe.brainPath` to the `brain` directory within that profile.

---

## Troubleshooting

### `No Antigravity CDP target on port 9222`
- Ensure Antigravity is running with `--remote-debugging-port=9222`.
- Check if another process is using the port.

### `Chat panel not found`
- Ensure a conversation is active and visible in the Antigravity side panel.

### Artifacts from the wrong session
- The extension uses the most recently modified folder. If you start a new chat just before capturing, it might pick up the new (empty) session. **Capture before starting a new chat.**

---

## Building from Source

```bash
npm install
npm run bundle
npm run package
```
This produces a `.vsix` file in the root directory.

---

## License

MIT © [Sciscend ЕООД](https://sciscend.com)
