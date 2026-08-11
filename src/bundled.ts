import * as vscode from "vscode";
import { ExecuteCommandRequest, LanguageClient } from "vscode-languageclient/node";

/**
 * The standard library, opened read-only.
 *
 * The server answers go-to-definition on an imported name with a
 * `musa-stdlib:/std/core.musa` location. There is no such file: the module's
 * text is compiled into the server binary. So VS Code is given a content
 * provider for that scheme, and the provider asks the server for the text —
 * it does not carry a copy of the standard library, and it does not read one
 * off disk, because either would be a second answer to a question the server
 * already answers.
 *
 * Read-only follows from the scheme: VS Code makes a document from a content
 * provider un-editable, which is the truth here — an edit would have nowhere
 * to land.
 */
const BUNDLED_SCHEME = "musa-stdlib";

/** The server command that answers with a bundled module's Musa source. */
const BUNDLED_SOURCE = "musa.bundledSource";

export function registerBundledSource(
  context: vscode.ExtensionContext,
  client: () => LanguageClient | undefined,
): void {
  const provider: vscode.TextDocumentContentProvider = {
    async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
      const running = client();
      if (!running) {
        // Honest, and visible in the editor rather than only in a log: the
        // text lives in the server, so without one there is nothing to show.
        return "The musa language server is not running, so the bundled module's text cannot be read.\n";
      }
      const answer = await running.sendRequest(ExecuteCommandRequest.type, {
        command: BUNDLED_SOURCE,
        arguments: [uri.toString()],
      });
      return typeof answer === "string" ? answer : String(answer ?? "");
    },
  };
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(BUNDLED_SCHEME, provider),
  );
}
