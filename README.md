# Antigravity Scribe

Capture thinking, tool calls & artifacts from [Google Antigravity IDE](https://antigravity.google) sessions directly into your Obsidian vault as structured Markdown notes.
No copy-pasting. No manual logging. No digging through AG's folders. Run the capture when your session is done and the note appears.


## Features

- **Full Session Capture:** Automatically extracts chat turns, thinking blocks, tool call summaries. Artifacts are excluded from the main capture, but can be browsed in `brain/<uuid>/` path.
- **Obsidian Integration:** Writes notes directly to your vault with proper YAML frontmatter and folder organization.
- **Auto-Scroll & Expand:** Uses CDP to intelligently scroll the chat panel and expand all collapsed blocks (Worked for, Thought for, Explored) to ensure no content is missed.
- **Verifiable Artifacts:** Matches the active session with Antigravity's "brain" directory to include `task.md` and `implementation_plan.md`.
- **Diagnostics:** Built-in connection check to verify your CDP port and brain path configuration.

---

## Extension Settings

This extension contributes the following settings:

* `agscribe.vaultPath`: **(Required)** Absolute path to your Obsidian vault root.
* `agscribe.vaultFolder`: Folder inside the vault for session notes (default: `AgentSessions`).
* `agscribe.brainPath`: Path to Antigravity brain directory (default: `~/.gemini/antigravity/brain`).
* `agscribe.port`: CDP remote debugging port (default: `9222`).
* `agscribe.openAfterCapture`: Automatically open the captured note in the editor (default: `true`).

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

## Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for details on how to get started.

## License

MIT © [Sciscend ЕООД](https://sciscend.com)
