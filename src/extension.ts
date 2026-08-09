import * as client from "./client";
import type { ExtensionContext } from "vscode";

export function activate(context: ExtensionContext): Thenable<void> {
  return client.activate(context);
}

export function deactivate(): Thenable<void> | undefined {
  return client.deactivate();
}
