import * as path from "path";
import * as vscode from "vscode";
import { runSnap, runDiagnose } from "./snapRunner";

let statusBar: vscode.StatusBarItem;
let lastTask = "session";

export function activate(ctx: vscode.ExtensionContext) {
  // ── Status bar ─────────────────────────────────────────────────────────────
  statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  setIdle();
  statusBar.show();
  ctx.subscriptions.push(statusBar);

  // ── Commands ───────────────────────────────────────────────────────────────

  // Quick capture — reuses last task label
  ctx.subscriptions.push(
    vscode.commands.registerCommand("agscribe.capture", () =>
      captureWithTask(lastTask)
    )
  );

  // Named capture — prompts first
  ctx.subscriptions.push(
    vscode.commands.registerCommand("agscribe.captureNamed", async () => {
      const task = await vscode.window.showInputBox({
        prompt: "Task label for this session note",
        value: lastTask,
        placeHolder: "e.g. refactor-auth, lex-rag-pipeline, session",
        validateInput: (v) => (v.trim() ? null : "Label cannot be empty"),
      });
      if (task === undefined) return;
      captureWithTask(task.trim());
    })
  );

  // Open vault folder in explorer
  ctx.subscriptions.push(
    vscode.commands.registerCommand("agscribe.openVault", async () => {
      const cfg = vscode.workspace.getConfiguration("agscribe");
      const vaultPath   = cfg.get<string>("vaultPath", "");
      const vaultFolder = cfg.get<string>("vaultFolder", "AgentSessions");

      if (!vaultPath) {
        vscode.window.showErrorMessage(
          "Antigravity Scribe: agscribe.vaultPath is not set."
        );
        return;
      }

      const { expandHome } = await import("./brain");
      const fullPath = require("path").join(expandHome(vaultPath), vaultFolder);
      await vscode.commands.executeCommand(
        "revealInExplorer",
        vscode.Uri.file(fullPath)
      );
    })
  );

  // Diagnostics
  ctx.subscriptions.push(
    vscode.commands.registerCommand("agscribe.diagnose", async () => {
      const report = await runDiagnose();
      const doc = await vscode.workspace.openTextDocument({
        content: report,
        language: "plaintext",
      });
      await vscode.window.showTextDocument(doc);
    })
  );
}

export function deactivate() {
  statusBar?.dispose();
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function captureWithTask(task: string) {
  lastTask = task;
  setBusy();

  try {
    const { outPath, turnCount, artifactCount, imageCount } = await runSnap(task);

    const parts = [
      `${turnCount} turn(s)`,
      artifactCount > 0 && `${artifactCount} artifact(s)`,
      imageCount > 0 && `${imageCount} image(s)`,
    ].filter(Boolean).join(", ");

    const msg = `Antigravity Scribe: Captured ${parts} → ${path.basename(outPath)}`;

    const cfg = vscode.workspace.getConfiguration("agscribe");
    const openAfter = cfg.get<boolean>("openAfterCapture", true);

    if (openAfter) {
      vscode.window.showInformationMessage(msg);
      const doc = await vscode.workspace.openTextDocument(outPath);
      await vscode.window.showTextDocument(doc, { preview: false });
    } else {
      const choice = await vscode.window.showInformationMessage(msg, "Open");
      if (choice === "Open") {
        const doc = await vscode.workspace.openTextDocument(outPath);
        await vscode.window.showTextDocument(doc, { preview: false });
      }
    }
  } catch (err: any) {
    vscode.window.showErrorMessage(`Antigravity Scribe: ${err.message ?? err}`);
  } finally {
    setIdle();
  }
}

function setIdle() {
  statusBar.text = "$(device-camera) AG Scribe";
  statusBar.tooltip = "Capture Antigravity session to Obsidian vault";
  statusBar.command = "agscribe.capture";
}

function setBusy() {
  statusBar.text = "$(sync~spin) AG Scribe…";
  statusBar.tooltip = "Capturing session…";
  statusBar.command = undefined;
}
