# VS Code Extension API Reference

## Table of contents

1. [Extension manifest (package.json)](#extension-manifest)
1. [Activation events](#activation-events)
1. [Contribution points](#contribution-points)
1. [Language configuration](#language-configuration)
1. [TextMate grammars](#textmate-grammars)
1. [Semantic tokens](#semantic-tokens)
1. [Programmatic language providers](#programmatic-language-providers)
1. [TreeView API](#treeview-api)
1. [Webview API](#webview-api)
1. [Testing](#testing)
1. [Bundling with esbuild](#bundling-with-esbuild)
1. [Packaging and publishing](#packaging-and-publishing)

______________________________________________________________________

## Extension manifest

The `package.json` serves as both npm manifest and VS Code extension manifest.

### Required fields

| Field | Description |
| --- | --- |
| `name` | All lowercase, no spaces, unique on Marketplace |
| `version` | SemVer |
| `publisher` | Publisher identifier from marketplace account |
| `engines.vscode` | Minimum VS Code version (never use `*`) |

### VS Code-specific fields

| Field | Description |
| --- | --- |
| `main` | Entry point for Node.js extension host (e.g., `"./dist/extension.js"`) |
| `browser` | Entry point for web extension host |
| `activationEvents` | Events that trigger extension loading (usually omit) |
| `contributes` | Static declarations (commands, languages, grammars, configuration, etc.) |
| `extensionKind` | `["ui"]`, `["workspace"]`, or both -- controls remote behavior |
| `extensionDependencies` | Required companion extensions |
| `extensionPack` | Bundle of extensions to install together |
| `capabilities` | Workspace trust and virtual workspace declarations |
| `categories` | `"Programming Languages"`, `"Linters"`, `"Themes"`, etc. |
| `preview` | Boolean flag for preview/beta status |

### Extension host model

Extensions run in an isolated Extension Host process, separate from the VS Code UI:

- **Node.js Extension Host** -- standard desktop runtime. Supports ESM (since VS Code 1.100) with `"type": "module"` in
  package.json.
- **Web Worker Extension Host** -- for browser-based VS Code (vscode.dev). Does not support ESM. Requires CJS.

______________________________________________________________________

## Activation events

Since VS Code 1.74.0, most contributed items activate implicitly. Explicit activation events are rarely needed.

| Event | Triggers when... |
| --- | --- |
| `onLanguage:langId` | A file of that language opens |
| `onCommand:commandId` | That command is invoked |
| `workspaceContains:glob` | Workspace contains matching files |
| `onFileSystem:scheme` | Files from that URI scheme are accessed |
| `onView:viewId` | A view becomes visible |
| `onUri` | A system URI matching the extension ID opens |
| `onWebviewPanel:viewType` | A webview panel needs restoring |
| `onStartupFinished` | VS Code completes startup (does not block startup) |
| `onChatParticipant:id` | A chat participant is invoked |
| `onLanguageModelTool:id` | A language model tool is invoked |
| `*` | Every VS Code startup (avoid) |

For language extensions, contributing a `languages` entry is sufficient -- VS Code activates when a matching file opens.

______________________________________________________________________

## Contribution points

The full set of `contributes.*` fields:

**Core:** `commands`, `configuration`, `configurationDefaults`, `keybindings`, `menus`, `submenus`, `authentication`

**Language & Syntax:** `languages`, `grammars`, `snippets`, `semanticTokenTypes`, `semanticTokenModifiers`,
`semanticTokenScopes`

**Views & UI:** `views`, `viewsContainers`, `viewsWelcome`, `walkthroughs`, `icons`, `iconThemes`

**Theming:** `themes`, `colors`, `productIconThemes`

**Debugging & Tasks:** `debuggers`, `breakpoints`, `taskDefinitions`, `problemMatchers`, `problemPatterns`

**AI:** `chatParticipants`, `chatParticipantDisambiguation`, `chatInstructions`, `chatPromptFiles`,
`languageModelTools`, `mcpServerDefinitionProviders`

**Specialized:** `customEditors`, `jsonValidation`, `typescriptServerPlugins`, `terminal`, `resourceLabelFormatters`

### Language contribution example

```json
{
  "contributes": {
    "languages": [
      {
        "id": "musa",
        "aliases": ["Musa", "musa"],
        "extensions": [".musa"],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "musa",
        "scopeName": "source.musa",
        "path": "./syntaxes/musa.tmLanguage.json"
      }
    ],
    "configuration": {
      "title": "Musa",
      "properties": {
        "musa.lsp.path": {
          "type": "string",
          "default": "",
          "markdownDescription": "Path to the `musa-lsp` binary"
        },
        "musa.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Trace LSP communication"
        }
      }
    }
  }
}
```

______________________________________________________________________

## Language configuration

The `language-configuration.json` file controls declarative language features:

```json
{
  "comments": {
    "lineComment": "//",
    "blockComment": ["/*", "*/"]
  },
  "brackets": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "\"", "close": "\"", "notIn": ["string"] }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["(", ")"],
    ["\"", "\""]
  ],
  "folding": {
    "markers": {
      "start": "^\\s*//\\s*#?region\\b",
      "end": "^\\s*//\\s*#?endregion\\b"
    }
  },
  "wordPattern": "(-?\\d*\\.\\d\\w*)|([^\\`\\~\\!\\@\\#\\%\\^\\&\\*\\(\\)\\-\\=\\+\\[\\{\\]\\}\\\\\\|\\;\\:\\'\\\"\\,\\.\\<\\>\\/\\?\\s]+)",
  "indentationRules": {
    "increaseIndentPattern": "^.*\\{[^}]*$",
    "decreaseIndentPattern": "^\\s*\\}"
  }
}
```

### Key fields

| Field | Purpose |
| --- | --- |
| `comments` | Enables Toggle Comment commands |
| `brackets` | Bracket matching and highlighting |
| `autoClosingPairs` | Auto-insert closing brackets/quotes; `notIn` excludes contexts |
| `surroundingPairs` | Pairs for wrapping selected text |
| `folding` | Custom folding markers (regex) |
| `wordPattern` | Defines word boundaries for double-click selection |
| `indentationRules` | Patterns for auto-indent increase/decrease |
| `onEnterRules` | Actions when Enter is pressed (e.g., continue `//` comments) |

______________________________________________________________________

## TextMate grammars

TextMate grammars handle lexical tokenization with regex patterns. Written in JSON (`.tmLanguage.json`).

### Structure

```json
{
  "name": "Musa",
  "scopeName": "source.musa",
  "patterns": [{ "include": "#comments" }, { "include": "#keywords" }],
  "repository": {
    "comments": {
      "patterns": [
        { "name": "comment.line.double-slash.musa", "match": "//.*$" },
        { "name": "comment.block.musa", "begin": "/\\*", "end": "\\*/" }
      ]
    },
    "keywords": {
      "patterns": [{ "name": "keyword.control.musa", "match": "\\b(fn|let|if|else|match|return)\\b" }]
    }
  }
}
```

### Pattern types

| Pattern | Use |
| --- | --- |
| `match` | Single-line regex. Assign `name` scope to entire match, or `captures` for groups |
| `begin`/`end` | Multi-line region. Can nest patterns inside |
| `include` | Reference another rule from `repository` or another grammar |

### Scope naming conventions

Follow the standard scope naming:

- `keyword.control`, `keyword.operator`, `keyword.modifier`
- `entity.name.function`, `entity.name.type`
- `variable.parameter`, `variable.other`
- `constant.numeric`, `constant.language`
- `string.quoted.double`, `string.quoted.single`
- `comment.line`, `comment.block`
- `storage.type`, `storage.modifier`

### Injection grammars

Extend existing grammars by injecting rules into specific scopes via `injectTo`. Useful for adding highlighting to
embedded code (e.g., SQL in strings).

______________________________________________________________________

## Semantic tokens

Semantic tokens layer on top of TextMate with language-server knowledge. They override TextMate tokens when available.

### Standard token types (25)

`namespace`, `type`, `class`, `enum`, `interface`, `struct`, `typeParameter`, `parameter`, `variable`, `property`,
`enumMember`, `event`, `function`, `method`, `macro`, `keyword`, `modifier`, `comment`, `string`, `number`, `regexp`,
`operator`, `decorator`, `label`

### Standard modifiers (14)

`declaration`, `definition`, `readonly`, `static`, `deprecated`, `abstract`, `async`, `modification`, `documentation`,
`defaultLibrary`

### Custom types and modifiers

Declare in `package.json`:

```json
"contributes": {
  "semanticTokenTypes": [{ "id": "hole", "description": "Typed hole" }],
  "semanticTokenModifiers": [{ "id": "linear", "description": "Linear binding" }],
  "semanticTokenScopes": {
    "hole": ["constant.other.hole"]
  }
}
```

### LSP semantic token encoding

Tokens are encoded as a flat array of 5-tuples: `[deltaLine, deltaStartChar, length, tokenType, tokenModifiers]`. The
token type and modifier indices reference the legend exchanged during initialization.

______________________________________________________________________

## Programmatic language providers

Every provider is registered via `vscode.languages.register*()` with a `DocumentSelector`.

| Provider | Registration | Purpose |
| --- | --- | --- |
| `CompletionItemProvider` | `registerCompletionItemProvider` | Code completion |
| `HoverProvider` | `registerHoverProvider` | Hover information |
| `DefinitionProvider` | `registerDefinitionProvider` | Go to definition |
| `TypeDefinitionProvider` | `registerTypeDefinitionProvider` | Go to type definition |
| `ImplementationProvider` | `registerImplementationProvider` | Go to implementation |
| `ReferenceProvider` | `registerReferenceProvider` | Find all references |
| `DocumentSymbolProvider` | `registerDocumentSymbolProvider` | Outline / breadcrumbs |
| `WorkspaceSymbolProvider` | `registerWorkspaceSymbolProvider` | Workspace-wide search |
| `CodeActionProvider` | `registerCodeActionProvider` | Quick fixes, refactorings |
| `CodeLensProvider` | `registerCodeLensProvider` | Inline actionable annotations |
| `InlayHintsProvider` | `registerInlayHintsProvider` | Inline type/parameter hints |
| `DocumentFormattingEditProvider` | `registerDocumentFormattingEditProvider` | Format document |
| `RenameProvider` | `registerRenameProvider` | Symbol rename |
| `FoldingRangeProvider` | `registerFoldingRangeProvider` | Custom folding |
| `SignatureHelpProvider` | `registerSignatureHelpProvider` | Function parameter info |
| `DocumentSemanticTokensProvider` | `registerDocumentSemanticTokensProvider` | Semantic highlighting |
| `CallHierarchyProvider` | `registerCallHierarchyProvider` | Call hierarchy |
| `TypeHierarchyProvider` | `registerTypeHierarchyProvider` | Type hierarchy |

When using LSP, most of these are handled by the language server. Register providers directly only for features not
covered by the server.

**DiagnosticCollection** is created via `vscode.languages.createDiagnosticCollection(name)`. Push diagnostics with
`.set(uri, diagnostics)`. When using LSP, the client handles this automatically.

______________________________________________________________________

## TreeView API

For sidebar views showing hierarchical data (e.g., module tree, proof obligations):

1. Declare in `contributes.views` (target: `explorer`, or a custom `viewsContainers`)
1. Implement `TreeDataProvider<T>` with `getChildren(element?)` and `getTreeItem(element)`
1. Register via `vscode.window.registerTreeDataProvider()` or `createTreeView()`
1. Fire `onDidChangeTreeData` events to refresh
1. Add context menus via `contributes.menus` with `view/item/context` target

______________________________________________________________________

## Webview API

Webview panels render HTML content in a sandboxed iframe. They are the mechanism for building custom UI like proof state
panels.

### Creating a webview panel

```typescript
const panel = vscode.window.createWebviewPanel(
  "musa.infoview", // viewType
  "Musa Info", // title
  vscode.ViewColumn.Beside, // position
  {
    enableScripts: true,
    retainContextWhenHidden: true, // keeps state when panel is not visible
    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, "dist", "webview")],
  },
);
```

### Communication

Bidirectional via `postMessage()`:

```typescript
// Extension -> Webview
panel.webview.postMessage({ type: "updateGoals", goals: [...] });

// Webview -> Extension
panel.webview.onDidReceiveMessage(message => {
  switch (message.type) {
    case "applyEdit": /* ... */ break;
    case "insertText": /* ... */ break;
  }
}, undefined, context.subscriptions);
```

### Webview HTML

```typescript
panel.webview.html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; script-src ${webview.cspSource}; style-src ${webview.cspSource};">
  <script src="${scriptUri}"></script>
</head>
<body>
  <div id="root"></div>
</body>
</html>`;
```

### Resource URIs

Convert local file paths to webview-accessible URIs:

```typescript
const scriptUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, "dist", "webview", "main.js"));
```

### Serialization

Implement `WebviewPanelSerializer` and register with `vscode.window.registerWebviewPanelSerializer()` to restore webview
state when VS Code restarts.

______________________________________________________________________

## Testing

### Setup

```bash
pnpm add -D @vscode/test-cli @vscode/test-electron
```

### Configuration (`.vscode-test.mjs`)

```javascript
import { defineConfig } from "@vscode/test-cli";
export default defineConfig({
  files: "out/test/**/*.test.js",
  version: "stable",
  workspaceFolder: "./test-fixtures",
  mocha: { timeout: 20000 },
});
```

### Test structure

```typescript
import * as assert from "assert";
import * as vscode from "vscode";

suite("Extension Test Suite", () => {
  test("diagnostics appear for errors", async () => {
    const doc = await vscode.workspace.openTextDocument({
      language: "musa",
      content: "bad code",
    });
    await vscode.window.showTextDocument(doc);

    // Wait for diagnostics to propagate
    await new Promise((resolve) => setTimeout(resolve, 2000));
    const diags = vscode.languages.getDiagnostics(doc.uri);
    assert.ok(diags.length > 0);
  });
});
```

### Running tests

```json
{
  "scripts": {
    "pretest": "pnpm run compile-tests && pnpm run compile",
    "test": "vscode-test"
  }
}
```

Tests run inside a real VS Code instance (Extension Development Host) with full API access.

### Debugging tests

Use a `launch.json` with `"type": "extensionHost"`:

```json
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Extension Tests",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}", "--extensionTestsPath=${workspaceFolder}/out/test"]
}
```

______________________________________________________________________

## Bundling with esbuild

esbuild is the recommended bundler (most VS Code built-in extensions use it).

### esbuild.js

```javascript
const esbuild = require("esbuild");
const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    target: "es2022",
    outfile: "dist/extension.js",
    external: ["vscode"],
    logLevel: "silent",
  });

  if (watch) {
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch(() => process.exit(1));
```

### Key rules

- Always externalize `vscode` (provided by runtime)
- Use `format: "cjs"` for maximum compatibility
- Set `platform: "node"` for desktop extensions
- Bundle only the extension, not tests
- Update `main` in package.json to point to bundled output
- Update `.vscodeignore` to exclude `src/`, `node_modules/`, `out/`

### Separate webview bundle

If building a webview (e.g., infoview), create a separate esbuild entry:

```javascript
await esbuild.build({
  entryPoints: ["src/webview/main.tsx"],
  bundle: true,
  format: "iife",
  platform: "browser",
  outfile: "dist/webview/main.js",
  external: [], // webviews must be self-contained
  define: { "process.env.NODE_ENV": JSON.stringify(production ? "production" : "development") },
});
```

______________________________________________________________________

## Packaging and publishing

### Create a .vsix

```bash
pnpm exec vsce package
```

### Publish

```bash
pnpm exec vsce login <publisher>
pnpm exec vsce publish
pnpm exec vsce publish --pre-release  # pre-release channel
```

### Platform-specific builds

For extensions bundling native binaries (like a language server):

```bash
pnpm exec vsce publish --target win32-x64 linux-x64 darwin-arm64 darwin-x64
```

### .vscodeignore

Exclude source and development files:

```
.vscode/**
.vscode-test/**
out/**
node_modules/**
src/**
*.map
**/*.ts
esbuild.js
tsconfig.json
eslint.config.mjs
.prettierrc.json
```

### Security

vsce scans for secrets (API keys, tokens, `.env` files) and blocks packaging if found. Never commit secrets to the
extension directory.
