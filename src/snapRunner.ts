import * as vscode from "vscode";
import { findTarget, CDPClient } from "./cdp";
import { EXTRACT_JS, Turn } from "./extractor";
import { findActiveBrainDir, readArtifacts, BrainResult } from "./brain";
import { renderNote, sessionFilename } from "./renderer";
import { prepareVault, copyImages, writeNote } from "./vault";

export interface SnapResult {
  outPath: string;
  turnCount: number;
  artifactCount: number;
  imageCount: number;
}

export async function runSnap(task: string): Promise<SnapResult> {
  const cfg = vscode.workspace.getConfiguration("agscribe");
  const port = cfg.get<number>("port", 9222);
  const brainPath = cfg.get<string>("brainPath", "~/.gemini/antigravity/brain");
  const vaultPath = cfg.get<string>("vaultPath", "");
  const vaultFolder = cfg.get<string>("vaultFolder", "AgentSessions");

  const wsFolder =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  // ── 1. CDP: extract chat turns ─────────────────────────────────────────────
  const target = await findTarget(port);
  if (!target) {
    throw new Error(
      `No Antigravity CDP target on port ${port}.\n` +
      `Make sure Antigravity is running with --remote-debugging-port=${port}.`
    );
  }

  const cdp = new CDPClient();
  await cdp.connect(target.webSocketDebuggerUrl);
  await cdp.send("Runtime.enable");

  let raw: string | null;
  try {
    raw = await cdp.evalJS(EXTRACT_JS);
  } finally {
    cdp.close();
  }

  if (!raw) {
    throw new Error("JS extraction returned nothing — is Antigravity responding?");
  }

  const turns: Turn[] = JSON.parse(raw);

  if (turns.length === 1 && turns[0].role === "_no_chat") {
    throw new Error(
      "Chat panel not found — is a conversation open in Antigravity?"
    );
  }

  // ── 2. Brain: find active dir and read artifacts ───────────────────────────
  let brainResult: BrainResult | null = null;

  try {
    const activeUuid = findActiveBrainDir(brainPath);
    if (activeUuid) {
      brainResult = readArtifacts(brainPath, activeUuid);
    }
  } catch (err: any) {
    // Non-fatal: warn but still write the chat turns
    vscode.window.showWarningMessage(
      `Antigravity Scribe: Could not read artifacts — ${err.message}`
    );
  }

  // ── 3. Vault: prepare dirs and copy images ─────────────────────────────────
  const { sessionDir, assetsDir } = prepareVault(vaultPath, vaultFolder);

  const allImages = brainResult?.allImages ?? [];
  const copiedImages = copyImages(allImages, assetsDir);

  // ── 4. Render and write note ───────────────────────────────────────────────
  const now = new Date();
  const note = renderNote(turns, {
    task,
    workspacePath: wsFolder,
    brainResult,
    copiedImages,
  });

  const filename = sessionFilename(task, now);
  const outPath = writeNote(sessionDir, filename, note);

  return {
    outPath,
    turnCount: turns.length,
    artifactCount: brainResult?.artifacts.length ?? 0,
    imageCount: copiedImages.size,
  };
}

// ---------------------------------------------------------------------------
// Diagnostic: report config state without capturing
// ---------------------------------------------------------------------------
export async function runDiagnose(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("agscribe");
  const port = cfg.get<number>("port", 9222);
  const brainPath = cfg.get<string>("brainPath", "~/.gemini/antigravity/brain");
  const vaultPath = cfg.get<string>("vaultPath", "");

  const out = vscode.window.createOutputChannel("Antigravity Scribe", { log: false });
  out.clear();
  out.show(true);

  const ok = (msg: string) => out.appendLine(`✅ ${msg}`);
  const err = (msg: string) => out.appendLine(`❌ ${msg}`);
  const info = (msg: string) => out.appendLine(`   ${msg}`);

  out.appendLine("=== Antigravity Scribe Diagnostics ===");
  out.appendLine("");

  // CDP
  const target = await findTarget(port);
  if (target) {
    ok(`CDP port ${port}: ${target.title?.slice(0, 60)}`);
  } else {
    err(`CDP port ${port}: No target found`);
    info(`Launch Antigravity with --remote-debugging-port=${port}`);
  }

  // Brain
  try {
    const { expandHome, findActiveBrainDir } = await import("./brain");
    const uuid = findActiveBrainDir(brainPath);
    ok(`Brain path: ${expandHome(brainPath)}`);
    info(`Active brain UUID: ${uuid ?? "(none found)"}`);
  } catch (e: any) {
    err(`Brain path: ${e.message}`);
  }

  // Vault
  if (vaultPath) {
    ok(`Vault path: ${vaultPath}`);
  } else {
    err(`Vault path: Not configured`);
    info(`Open Settings → search 'Antigravity Scribe' → set Vault Path`);
  }

  out.appendLine("");
}