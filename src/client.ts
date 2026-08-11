import { execFileSync } from "child_process";
import * as vscode from "vscode";
import { LanguageClient, ServerOptions, TransportKind } from "vscode-languageclient/node";
import { registerAnalysis } from "./analysis";
import { registerBundledSource } from "./bundled";

/**
 * The extension is a launcher and a registration, nothing more (prompt 81):
 * it finds the prompt 77 server, starts it over stdio, and hands every
 * question about the music back to it. The vocabulary and the musical
 * knowledge live in the musa repository; what lives here is a setting, a
 * command, and one honest error.
 */
let client: LanguageClient | undefined;
let output: vscode.OutputChannel | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  output = vscode.window.createOutputChannel("musa language server");
  context.subscriptions.push(
    vscode.commands.registerCommand("musa.restartServer", async () => {
      output?.appendLine("restarting the language server");
      await stop();
      await start();
    }),
  );
  // Registered once, for the life of the extension: both read through
  // whatever client is running when they are asked, so a restart does not
  // leave a stale provider behind.
  registerBundledSource(context, () => client);
  registerAnalysis(context, () => client);
  await start();
}

export async function deactivate(): Promise<void> {
  await stop();
}

async function start(): Promise<void> {
  const binary = findServer();
  if (!binary) {
    // One honest error, saying what to install — no auto-download.
    const action = await vscode.window.showErrorMessage(
      "The musa language server (musa-lsp) was not found.",
      "How to install",
      "Set musa.server.path",
    );
    if (action === "How to install") {
      output?.appendLine("Build the server in a checkout of the musa repository:");
      output?.appendLine("  cargo build --release -p musa-lsp");
      output?.appendLine("and either put target/release/musa-lsp on your PATH or set musa.server.path to it.");
      output?.show();
    } else if (action === "Set musa.server.path") {
      await vscode.commands.executeCommand("workbench.action.openSettings", "musa.server.path");
    }
    return;
  }

  const serverOptions: ServerOptions = {
    command: binary,
    transport: TransportKind.stdio,
  };
  client = new LanguageClient("musa-lsp", "musa language server", serverOptions, {
    documentSelector: [{ scheme: "file", language: "musa" }],
    synchronize: {
      configurationSection: "musa",
      fileEvents: vscode.workspace.createFileSystemWatcher("**/*.musa"),
    },
    outputChannel: output,
  });
  try {
    await client.start();
    output?.appendLine(`language server running: ${binary}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    output?.appendLine(`the language server failed to start: ${message}`);
    void vscode.window.showErrorMessage(`The musa language server failed to start: ${message}`);
  }
}

async function stop(): Promise<void> {
  if (client) {
    try {
      await client.stop();
    } catch {
      // Already stopped; stopping is a wish, not a contract.
    }
    client = undefined;
  }
}

/** The setting first, then PATH. Nowhere else: a found binary is a trust. */
function findServer(): string | undefined {
  const configured = vscode.workspace.getConfiguration("musa").get<string>("server.path");
  if (configured) {
    return configured;
  }
  const name = process.platform === "win32" ? "musa-lsp.exe" : "musa-lsp";
  const which = process.platform === "win32" ? "where" : "which";
  try {
    const found = execFileSync(which, [name], { encoding: "utf8" }).trim().split("\n")[0];
    return found || undefined;
  } catch {
    return undefined;
  }
}
