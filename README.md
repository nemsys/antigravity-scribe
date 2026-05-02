# Antigravity Scribe

> **Capture agents thinking, tool calls & artifacts to your Obsidian vault**

Antigravity Scribe is a VS Code extension for [Google Antigravity IDE](https://antigravity.google) that captures the full content of an agent session — chat turns, thinking blocks, tool calls, task lists, implementation plans, and screenshots — and writes a single structured Markdown note directly into your Obsidian vault.

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
Connects to Antigravity's built-in Chromium process via a local debug port and extracts the full conversation from the DOM — user messages, agent responses, thinking blocks (expanded or collapsed), and tool call summaries. The CDP hack is needed because Antigravity does not expose an API for session data, and the conversation  are stored locally as .pb files, which are Protocol Buffers (a binary serialization format) that would require complex parsing and reverse engineering. The CDP approach is more flexible and future-proof, as it relies on the rendered UI rather than internal storage formats.

**2. Brain directory (filesystem)**
Antigravity writes its verifiable artifacts (`task.md`, `implementation_plan.md`, screenshots, browser recordings) to a local `brain/` directory in real-time during every session. The extension reads the most recently modified UUID folder — which is always the active session — and includes the artifact content and images in the note.

Both sources are combined into a single Obsidian-native Markdown note with YAML frontmatter, embedded images, and linked artifacts.

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

### Option B — Install via CLI

```bash
code --install-extension antigravity-scribe-0.1.0.vsix
```

If you use a custom Antigravity binary, replace `code` with the path to your Antigravity executable.

### Option C — Build from source

See [Building from Source](#building-from-source) at the end of this document.

---

## Configuration

Open Settings (`Ctrl+,`) and search for **Antigravity Scribe**, or add these keys to your `settings.json`:

```jsonc
{
  // Required — path to your Obsidian vault root
  "agscribe.vaultPath": "/home/yourname/Obsidian/Universum",

  // Required if you use a custom Antigravity profile (see below)
  // Default works for standard installations
  "agscribe.brainPath": "~/.gemini/antigravity/brain",

  // Folder inside the vault where session notes are written
  // Will be created automatically if it does not exist
  "agscribe.vaultFolder": "AgentSessions",

  // CDP port Antigravity is listening on
  // Must match --remote-debugging-port when you launch Antigravity
  "agscribe.port": 9222,

  // Open the captured note in the editor immediately after capture
  "agscribe.openAfterCapture": true
}
```

### Minimum required configuration

You must set at least `agscribe.vaultPath`. Everything else has a working default.

```jsonc
{
  "agscribe.vaultPath": "/absolute/path/to/your/vault"
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

**If you run multiple Antigravity profiles**, use a different port per profile:
```bash
antigravity --remote-debugging-port=9222 --user-data-dir=~/Antigravity_Profiles/profile1
antigravity --remote-debugging-port=9333 --user-data-dir=~/Antigravity_Profiles/profile2
```
Then set `agscribe.port` to match the instance you want to capture from.

> The debug port binds to `127.0.0.1` only — it is not exposed to the network.

---

### Step 2 — Configure the extension

At minimum, set your vault path. Open `settings.json` and add:

```jsonc
{
  "agscribe.vaultPath": "/home/yourname/Obsidian/Universum"
}
```

If you use a custom Antigravity profile, also set `agscribe.brainPath`
(see [Custom Antigravity Profiles](#custom-antigravity-profiles)).

---

### Step 3 — Verify the setup with diagnostics

Before your first real capture, run:

```
Antigravity Scribe: Diagnose Connection
```

(Command Palette → `Ctrl+Shift+P`)

You should see:
```
=== Antigravity Scribe Diagnostics ===

CDP port 9222: ✓  Antigravity - my-project
Brain path:    ✓  /home/yourname/Antigravity_Profiles/phoneiep/app_config/.gemini/antigravity/brain
Active brain UUID: 50fa0573-52e0-4755-96f4-c98d1e808133
Vault path:    ✓  /home/yourname/Obsidian/Universum
```

If any line shows `✗`, fix it before proceeding — see [Troubleshooting](#troubleshooting).

---

### Step 4 — Have your agent conversation

Work normally in Antigravity. Let the agent complete its task, review artifacts,
and iterate as needed. Antigravity Scribe captures the state at the moment you
trigger it, so **capture when the session is done**, not mid-stream.

---

### Step 5 — Capture

When ready, choose one of:

| Method | When to use |
|---|---|
| Click **$(device-camera) AG Scribe** in the status bar | Quick capture, reuses the last task label |
| Command Palette → `Antigravity Scribe: Capture Session (named task)` | When you want to give this session a meaningful label |

The task label becomes part of the filename: `20260501_1430_refactor-auth.md`

The note is written to your vault and opened automatically (configurable with `agscribe.openAfterCapture`).

---

### Optional — Keyboard shortcut

Add to `keybindings.json`:

```jsonc
[
  {
    "key": "ctrl+shift+s",
    "command": "agscribe.captureNamed"
  }
]
```

---

## Commands

| Command | Description |
|---|---|
| `Antigravity Scribe: Capture Session` | Capture using the last-used task label (default: `session`) |
| `Antigravity Scribe: Capture Session (named task)` | Prompt for a label, then capture |
| `Antigravity Scribe: Open Sessions in Vault` | Reveal the sessions folder in the Explorer sidebar |
| `Antigravity Scribe: Diagnose Connection` | Check CDP, brain path, and vault config |

---

## Output Format

### Vault structure

```
<vault>/
└── AgentSessions/
    ├── 20260501_1430_refactor-auth.md
    ├── 20260501_1615_session.md
    └── assets/
        ├── media__1776176592567.png
        └── media__1776180012345.png
```

### Note structure

```markdown
---
date: 2026-05-01
time: 14:30
agent: antigravity
task: refactor-auth
workspace: "/home/yourname/myproject"
brain_uuid: 50fa0573-52e0-4755-96f4-c98d1e808133
tags:
  - agent-session
  - antigravity
---

## Artifacts

### Task
> Task tracking for implementing the auth refactor.
*Updated: 5/1/2026, 14:23:04*

- [ ] Audit existing auth middleware
- [ ] Replace session tokens with JWT
- [ ] Update all protected routes

### Implementation Plan
> Architecture changes for JWT migration.
*Updated: 5/1/2026, 14:25:11*

1. Install `jsonwebtoken` and `@types/jsonwebtoken`
2. Create `src/auth/jwt.ts` with sign/verify helpers
...

### Screenshots & Media
![[assets/media__1776176592567.png]]

---

## Session

### 👤 USER  `14:22:51`
Refactor the auth system to use JWT instead of session tokens.

### 🧠 THOUGHT  `14:22:54`
The user wants to migrate from session-based auth to JWT...

### 🤖 AGENT  `14:23:01`
I'll start by auditing the current middleware...

### 🔧 TOOL CALL  `14:23:15`
Viewed: src/middleware/auth.js

### 🤖 AGENT  `14:23:22`
The current implementation uses `express-session`...
```

### Frontmatter fields

| Field | Description |
|---|---|
| `date` | Capture date (YYYY-MM-DD) |
| `time` | Capture time (HH:MM) |
| `agent` | Always `antigravity` in this version |
| `task` | The label you provided at capture time |
| `workspace` | Absolute path to the open workspace folder |
| `brain_uuid` | UUID of the matched brain artifact directory |
| `tags` | `agent-session`, `antigravity` — extend in your Obsidian templates |

---

## Artifact Matching

Antigravity writes artifact files to a local directory in real-time while the agent works:

```
~/.gemini/antigravity/brain/
└── <uuid>/
    ├── task.md
    ├── task.md.metadata.json
    ├── task.md.resolved          ← final version, this is what we read
    ├── task.md.resolved.0        ← revision history, skipped
    ├── implementation_plan.md.resolved
    ├── implementation_plan.md.metadata.json
    └── media__1776176592567.png
```

The extension finds the active session by selecting the **most recently modified UUID directory**. Since Antigravity writes to this directory continuously during a session, the hottest directory is always the current one. No UUID extraction from the DOM, no timestamp window, no configuration required.

The `.resolved` file is preferred over the bare `.md` — it contains the final, comment-resolved version of the artifact.

---

## Custom Antigravity Profiles

If you launch Antigravity with `--user-data-dir` pointing to a custom location, the brain path will differ from the default.

**Find your brain directory:**
```bash
find ~/Antigravity_Profiles/yourprofile -iname 'brain' -type d
```

Example output:
```
/home/yourname/Antigravity_Profiles/phoneiep/app_config/.gemini/antigravity/brain
```

**Set it in settings:**
```jsonc
{
  "agscribe.brainPath": "~/Antigravity_Profiles/phoneiep/app_config/.gemini/antigravity/brain"
}
```

The `~` shorthand is supported. Absolute paths also work.

---

## Troubleshooting

### `No Antigravity CDP target on port 9222`

Antigravity is not running with the debug port, or is using a different port.

- Confirm the launch flag: `antigravity --remote-debugging-port=9222`
- Confirm `agscribe.port` matches
- Test manually in a terminal: `curl http://localhost:9222/json`  
  You should get a JSON array. If the connection is refused, the port is not active.

### `Chat panel not found`

The CDP connection succeeded but the conversation UI could not be located.

- Make sure a conversation is open and visible — not just the Agent Manager dashboard
- Scroll the chat panel so it is fully rendered
- Try capturing again

### `Brain path not found`

The configured `agscribe.brainPath` does not exist.

- Run: `find ~ -iname 'brain' -path '*antigravity*' -type d`
- Update `agscribe.brainPath` with the result

### `agscribe.vaultPath is not set`

Open Settings, search **Antigravity Scribe**, fill in **Vault Path**.

### Artifacts appear from the wrong session

This can happen if you start a new conversation immediately before capturing the previous one, causing the brain directory to change.

- Always capture before starting a new conversation
- The `brain_uuid` in the note's frontmatter lets you verify which brain dir was used

### Images are broken in Obsidian

- Check that images were copied: `ls <vault>/AgentSessions/assets/`
- In Obsidian go to **Settings → Files & Links → New link format** → set to **Relative path to file** or **Shortest path**
- The embed syntax used is `![[assets/filename.png]]`, relative to the note's folder

---

## Building from Source

```bash
# 1. Unzip or clone the source
cd antigravity-scribe

# Install dependencies, compile, and package in one step:
npm install && npm run compile && npm run package
# → antigravity-scribe-0.1.0.vsix

# 5. Install
code --install-extension antigravity-scribe-0.1.0.vsix
```

**Development mode** (live recompile on save):

```bash
npm run watch
```

Then press `F5` in Antigravity / VS Code to launch an Extension Development Host with the extension loaded. Changes take effect after `Ctrl+R` in the host window.

---

## License

MIT © [Sciscend ЕООД](https://sciscend.com)
