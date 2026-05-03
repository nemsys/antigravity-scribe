import * as vscode from "vscode";
import { findTarget, CDPClient } from "./cdp";
import { EXTRACT_JS, EXTRACT_TITLE_JS, Turn } from "./extractor";
import { findActiveBrainDir, readArtifacts, BrainResult } from "./brain";
import { renderNote, sessionFilename } from "./renderer";
import { prepareVault, copyImages, writeNote } from "./vault";

export interface SnapResult {
  outPath: string;
  turnCount: number;
  artifactCount: number;
  imageCount: number;
  skipped?: boolean;
}

export async function runSnap(task: string): Promise<SnapResult> {
  const resolvedTask = task || "session";
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
  let conversationTitle: string | null;
  try {
    raw = await cdp.evalJS(EXTRACT_JS);
    conversationTitle = await cdp.evalJS(EXTRACT_TITLE_JS);
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

  if (turns.length === 0) {
    vscode.window.showWarningMessage(
      "Antigravity Scribe: Conversation is empty — start a conversation before capturing."
    );
    return { outPath: "", turnCount: 0, artifactCount: 0, imageCount: 0, skipped: true };
  }

  // ── 1b. Resolve effective task label ─────────────────────────────────────
  // If task is the default "session" and we got a conversation title, use that
  const effectiveTask = (task === "session" && conversationTitle)
    ? conversationTitle.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)
    : task;

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
    task: effectiveTask,
    workspacePath: wsFolder,
    brainResult,
    copiedImages,
  });

  const filename = sessionFilename(effectiveTask, now);
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
export async function runDiagnose(out: vscode.OutputChannel): Promise<void> {
  const cfg = vscode.workspace.getConfiguration("agscribe");
  const port = cfg.get<number>("port", 9222);
  const brainPath = cfg.get<string>("brainPath", "~/.gemini/antigravity/brain");
  const vaultPath = cfg.get<string>("vaultPath", "");

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