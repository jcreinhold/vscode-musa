---
name: vscode-extension
description: 'Use for VS Code extensions: package.json, TS extension code, language clients, webview panels, TextMate grammars, esbuild, vsce packaging, LSP integration with musa-lsp, vscode-musa repo.'
---

# VS Code Extension Development

This skill covers building VS Code language extensions with LSP integration. It is structured for the musa language
extension (the `vscode-musa` repo) but applies to any language extension that needs deep compiler integration.

## Critical rule: read existing code first

Before modifying any extension code, read the relevant files. For `vscode-musa`, start with `package.json` and
`src/client.ts`. For the LSP server, start with `crates/musa-lsp/src/lib.rs` and `crates/musa-lsp/src/features/` in the
musa repo. Understand the current architecture before changing it.

## Architecture overview

A VS Code language extension has three layers:

```
VS Code UI
  |
  v
Extension Host (TypeScript)          <-- vscode-musa repo
  |  registers language, grammar, configuration
  |  creates LanguageClient (vscode-languageclient)
  |  manages webview panels (optional)
  |  registers chat participants, tools (optional)
  |
  v  (JSON-RPC over stdio)
Language Server (Rust)               <-- crates/musa-lsp/ in the musa repo
  |  thin shell over musa-project + musa-language
  |  handles didOpen/didChange/didClose
  |  provides diagnostics, hover, completion, formatting, etc.
  |
  v
Semantic Core                        <-- crates/musa-project/, crates/musa-compiler/
     ProjectSession facade, resolution, elaboration, snapshots
```

For rich musical UI (score preview, timeline inspection), add a fourth component:

```
Webview Panel (React)                <-- vscode-musa/src/preview/ (planned)
  |  renders score/notation snapshots, timeline views
  |  communicates with extension host via postMessage
  |
  v
Extension Host bridges webview <-> language server
```

## Quick reference

### Extension manifest (package.json)

| Field | Purpose |
| --- | --- |
| `engines.vscode` | Minimum VS Code version |
| `main` | Entry point: `"./dist/extension.js"` (bundled output) |
| `activationEvents` | `onLanguage:musa`; contributed items activate implicitly since 1.74 |
| `contributes.languages` | Language ID `musa`, extension `.musa`, language configuration path |
| `contributes.grammars` | TextMate grammar (`syntaxes/musa.tmLanguage.json`) |
| `contributes.configuration` | User-facing settings under the `musa.*` namespace |
| `contributes.commands` | Commands exposed to command palette (e.g. `musa.restartServer`) |
| `contributes.chatParticipants` | AI chat participants (e.g., `@musa`) |
| `contributes.languageModelTools` | Tools available to AI in agent mode |

### Extension entry point

```typescript
// src/extension.ts -- thin entry, delegate to modules
import * as client from "./client";
import type { ExtensionContext } from "vscode";

export function activate(context: ExtensionContext) {
  return client.activate(context);
}

export function deactivate() {
  return client.deactivate();
}
```

### Language client setup (for Rust LSP over stdio)

```typescript
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";

const serverOptions: ServerOptions = {
  run: { command: serverPath, transport: TransportKind.stdio },
  debug: {
    command: serverPath,
    transport: TransportKind.stdio,
    options: { env: { ...process.env, RUST_LOG: "debug" } },
  },
};

const clientOptions: LanguageClientOptions = {
  documentSelector: [{ scheme: "file", language: "musa" }],
  synchronize: { fileEvents: workspace.createFileSystemWatcher("**/*.musa") },
  outputChannel: window.createOutputChannel("musa language server"),
};

client = new LanguageClient("musa-lsp", "musa language server", serverOptions, clientOptions);
await client.start();
```

### CLI commands (vscode-musa)

| Command | Purpose |
| --- | --- |
| `npm run compile` | Type-check + grammar check + bundle with esbuild |
| `npm run package` | Production bundle (also runs on `vscode:prepublish`) |
| `npm run check` | `tsc --noEmit` + `grammar:check` |
| `npm run grammar` | Regenerate `syntaxes/musa.tmLanguage.json` from `build/generate-grammar.js` |
| `npm run grammar:check` | Verify the committed TextMate grammar matches its generator |
| `npm test` | Run unit tests (`node --test`) |
| `vsce package` | Create .vsix file |
| `vsce publish` | Publish to marketplace |

## Best practices

1. **Bundle with esbuild.** Always externalize `vscode`. Use CJS format for maximum compatibility. Set
   `platform: "node"`, `target: "es2022"`. Minify only for production builds. (`vscode-musa/esbuild.js` already does
   this — keep it that way.)

1. **Use strict TypeScript.** Enable `strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`,
   `noUncheckedIndexedAccess`. Set `module: "Node16"` and `moduleResolution: "Node16"`.

1. **Binary discovery strategy.** For `musa-lsp` shipped as a separate binary, check in order: user-configured path
   (`musa.server.path` setting), workspace `target/release/` (development), `~/.cargo/bin/` (cargo install), system
   PATH. Show a clear error message with installation instructions if not found.

1. **Debounce document changes.** Language servers should not run expensive analysis on every keystroke. Use incremental
   text sync (`TextDocumentSyncKind.Incremental`). For expensive operations (full elaboration), debounce by 200-500ms
   after the last change.

1. **Semantic tokens complement TextMate.** The TextMate grammar handles lexical coloring. Semantic tokens from musa-lsp
   (powered by `musa-language`'s highlight support) add context-aware highlighting that overrides TextMate when
   available. Register both.

1. **Dispose everything.** Push all disposables to `context.subscriptions`. Clean up the language client in
   `deactivate()`. Use `client.dispose()` (not `client.stop()`) in newer vscode-languageclient versions.

1. **Test with real VS Code.** Use `@vscode/test-cli` + `@vscode/test-electron` for integration tests. Tests run in an
   Extension Development Host with full API access. Define fixtures in a `test-fixtures/` directory.

1. **Platform-specific builds.** When bundling native binaries, use
   `vsce publish --target win32-x64 linux-x64 darwin-arm64 darwin-x64` to create per-platform .vsix files. Use the
   `--pre-release` flag for development versions.

1. **Error messages guide action.** When the LSP binary is missing or crashes, show messages that tell the user exactly
   what to do: installation command, configuration setting, link to docs. Never show raw stack traces.

1. **Webview panels for rich UI.** Use `vscode.window.createWebviewPanel()` with `retainContextWhenHidden: true` for
   panels that maintain state when hidden. Communicate via `postMessage()` with typed message envelopes.

## Common mistakes

| Mistake | Fix |
| --- | --- |
| Using `*` activation event | Omit activation events entirely; rely on implicit activation from contributed languages/commands |
| Not bundling the extension | Always use esbuild; unbundled extensions load orders of magnitude slower |
| Full text sync in LSP | Use `TextDocumentSyncKind.Incremental` to send only changes |
| Blocking the extension host | Run expensive operations in the language server process, not in the TypeScript extension |
| Forgetting `external: ["vscode"]` in esbuild | The `vscode` module is provided by the runtime; bundling it causes errors |
| Not handling LSP server crashes | Register `client.onDidChangeState` and show a restart prompt on crash |
| Hardcoded binary paths | Use the discovery strategy (setting > workspace > cargo > PATH) |

## Musa-specific guidance

The musa VS Code extension (`vscode-musa` repo) wraps the musa language server (`crates/musa-lsp/` in the musa repo).
Key points:

- **The source is canonical.** `.musa` text is the only artifact; every feature (diagnostics, hover, formatting, quick
  fixes, references) is a projection of `ProjectSession` facts. Never build a second editable AST in the extension.
- **The LSP is a thin shell.** It answers on half-typed source via `musa-language` (highlighting, completion) and on
  compiled documents via `musa-project` — roadmap §15.11. Features live in `crates/musa-lsp/src/features/`; the
  extension should stay a thin client and push smarts server-side.
- **Formatting** comes from `musa-language`'s lossless CST formatter; expose it through the LSP's
  `textDocument/formatting`, not a client-side formatter.
- **The TextMate grammar is generated.** `syntaxes/musa.tmLanguage.json` is produced by `build/generate-grammar.js` —
  edit the generator, never the JSON, and keep `npm run grammar:check` green. It provides baseline highlighting; the
  LSP's semantic tokens (`crates/musa-lsp/src/features/semantic_tokens.rs`) add contextual highlighting. The tree-sitter
  grammar in the musa repo (`editors/tree-sitter-musa/`) is the Zed-side artifact — all three must not drift from
  `musa-language`'s lexer (see the tree-sitter-grammar skill and the drift law).
- **Layer separation is law** (roadmap §2): written pitch ≠ MIDI number, notated duration ≠ performed duration, voice ≠
  mixer track. Hover and completion should surface the *written* layer; performance data belongs to custom views.
- The `musa.restartServer` command exists for development; wire new commands through `contributes.commands` and keep
  them thin wrappers over LSP requests.

### Planned features

For a score-editor-quality experience, the extension should eventually include:

- **Score preview panel** -- webview rendering the compiled score snapshot / NotationPlan at cursor position, updating
  on document change. See `references/proof-assistant-patterns.md` for the webview + RPC pointer architecture (written
  for proof assistants; the pattern transfers).
- **File progress indicators** -- gutter decorations showing which documents have compiled cleanly, via a
  `$/musa/fileProgress` custom LSP notification.
- **Custom LSP extensions** -- `musa/viewTimeline` (elaborated kernel timeline for a part), `musa/viewScore` (compiled
  score snapshot), `musa/viewMotif` (a motif definition's expansions).
- **RPC pointer pattern** -- opaque server-side handles for score/timeline objects, avoiding serialization of large
  snapshots.

### AI integration

Three complementary integration paths:

1. **MCP server** wrapping `musa-project` queries -- works with both VS Code agent mode and Claude Code. Highest
   reusability.
1. **Language Model Tool** (`musa_diagnostics`, `musa_motifSearch`) -- runs in the extension host, appears in agent mode
   alongside standard tools.
1. **Chat participant** (`@musa`) -- dedicated @-mentionable assistant for notation questions, compilation errors, and
   domain queries.

See `references/ai-integration-reference.md` for implementation details.

## Reference files

Read these when you need deeper information on a specific topic:

| File | When to read |
| --- | --- |
| `references/extension-api-reference.md` | Extension manifest fields, contribution points, activation events, testing, packaging |
| `references/lsp-reference.md` | LSP protocol, Rust frameworks, server architecture, incremental analysis |
| `references/proof-assistant-patterns.md` | Lean 4 infoview, webview panels, RPC pattern, rich state display (transfers to score preview) |
| `references/ai-integration-reference.md` | Chat participants, Language Model Tools, MCP servers, Claude Code integration |
| `references/golden-examples.md` | rust-analyzer, vscode-lean4, gopls architecture patterns |
