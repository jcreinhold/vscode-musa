# Proof Assistant Extension Patterns

Architectural patterns from Lean 4, Coq, Agda, and Idris 2 extensions, with recommendations for Musa.

## Table of contents

1. [Lean 4 architecture (primary reference)](#lean-4-architecture)
1. [Coq ecosystem](#coq-ecosystem)
1. [Agda and Idris 2](#agda-and-idris-2)
1. [Cross-cutting patterns](#cross-cutting-patterns)
1. [Recommendations for Musa](#recommendations-for-musa)

______________________________________________________________________

## Lean 4 architecture

The Lean 4 extension (`vscode-lean4`) is the primary reference for building a proof-assistant VS Code extension. Its
architecture is the most relevant for Musa.

### Package structure

Lerna monorepo with five packages:

| Package                         | Role                                                        |
| ------------------------------- | ----------------------------------------------------------- |
| `vscode-lean4`                  | Main VS Code extension (Node.js, Extension Host)            |
| `lean4-infoview-api`            | Shared type definitions for extension-webview communication |
| `lean4-infoview`                | React application running in a sandboxed webview            |
| `lean4-unicode-input`           | Abbreviation expansion logic                                |
| `lean4-unicode-input-component` | DOM integration for Unicode input                           |

### Three-process architecture

```
Extension Host (Node.js)
  |  LeanClientProvider, LeanClient, InfoProvider
  |  manages server lifecycle
  |  bridges webview <-> server
  |
  +--- postMessage ---> Webview (Browser sandbox)
  |                       React InfoView
  |                       renders proof state
  |
  +--- JSON-RPC/stdio --> Language Server (lean --server)
                            per-file worker processes
                            snapshot-based incremental checking
```

### Communication protocols

Three distinct protocols connect the processes:

**1. LSP (Extension Host \<-> Server):** Standard LSP plus custom Lean notifications prefixed with `$/lean/`:

- `$/lean/fileProgress` -- reports which file ranges are being processed
- `$/lean/rpc/connect`, `$/lean/rpc/call`, `$/lean/rpc/keepAlive`, `$/lean/rpc/release` -- the RPC subsystem

`LeanClient` wraps VS Code's `LanguageClient`. A "star handler" intercepts all non-standard messages and fires event
emitters.

**2. PostMessage (Extension Host \<-> Webview):** Typed message envelopes. Two interfaces:

**EditorApi** (infoview calls the extension):

- `sendClientRequest()` -- proxy LSP requests through the extension
- `sendClientNotification()` -- proxy LSP notifications
- `subscribeServerNotifications()` -- subscribe to server events
- `createRpcSession()` / `closeRpcSession()` -- manage RPC connections
- `insertText()` -- insert text into the editor
- `applyEdit()` -- apply workspace edits
- `showDocument()` -- navigate to a location
- `copyToClipboard()` -- clipboard access
- `restartFile()` -- restart elaboration

**InfoviewApi** (extension calls the infoview):

- `initialize()` -- set up the infoview
- `gotServerNotification()` -- forward server notifications
- `changedCursorLocation()` -- cursor moved in editor
- `changedInfoviewConfig()` -- settings changed
- `serverRestarted()` / `serverStopped()` -- lifecycle events

**3. RPC Sessions (stateful server calls):** `RpcSessionAtPos` connects to the server with `$/lean/rpc/connect`, gets a
session ID, then makes `$/lean/rpc/call` requests. Keep-alive pings every 10 seconds.

**RPC Pointer pattern:** `RpcPtr<T>` are opaque references to server-side objects. The server holds the real objects;
the client holds integer handles. This avoids serializing large proof states, environments, and contexts. The key
architectural insight: never try to serialize the full elaboration state. Send handles and let the server render on
demand.

### Lean server internals

- **Watchdog + per-file workers:** One watchdog manages the server. One worker process per open file. A crash in one
    file does not affect others.
- **Snapshot tree:** Each top-level command produces a snapshot storing diagnostics and processing state. Snapshots are
    reused between file versions -- only changed commands re-elaborate.
- **InfoTree:** Stores elaboration metadata: goal states, subterm info, local contexts, metavariable contexts, macro
    expansions. Powers hover info and goal display.
- **Import dependencies:** `.olean` files. Users manually trigger "refresh file dependencies."

### InfoView React architecture

```
Main (root context providers)
  +-- Infos (all info items for current cursor)
  |     +-- Info (single info item)
  |           +-- InteractiveGoal (goal with hypotheses)
  |           +-- InteractiveCode (syntax-highlighted terms)
  |           +-- PanelWidgetDisplay (user widgets)
  +-- AllMessages (diagnostics)
```

State flows through React Context:

- `EditorContext` -- editor API and event emitters
- `ConfigContext` -- user preferences
- `RpcContext` -- RPC session management
- `EnvPosContext` -- current cursor/pin position
- `LspDiagnosticsContext` -- server diagnostics

The webview is created with:

```typescript
vscode.window.createWebviewPanel("lean4_infoview", "Lean Infoview", column, {
  retainContextWhenHidden: true,
  enableScripts: true,
});
```

### Interactive features

**Goal state display:** Cursor move fires `changedCursorLocation()` to infoview. Infoview makes RPC calls
(`getInteractiveGoals`, `getInteractiveTermGoal`) to fetch proof state. Server finds the relevant snapshot, returns
structured goal data.

**"Try This" suggestions:** Tactics like `exact?` produce "Try this:" messages. Appear as clickable links in infoview
and as VS Code code actions (Ctrl+.). Clicking applies the suggested text via `insertText()`.

**User widgets:** `@[widget_module]`-annotated Lean code bundles JavaScript ES modules. The infoview's
`DynamicComponent` loader fetches widget source via `Widget_getWidgetSource` RPC, then dynamically imports it. Widgets
get RPC access for server communication.

**File progress:** `$/lean/fileProgress` notification reports per-range processing status. The extension renders this as
gutter decorations (colored bars in the margin).

### Multi-project support

`LeanClientProvider` maintains a map from folder URIs to `LeanClient` instances. Each project gets its own server
process, supporting workspaces with multiple Lean versions.

______________________________________________________________________

## Coq ecosystem

Two competing approaches:

### VsCoq 2 (vsrocq)

**Server:** OCaml, linked against the Coq API. Components:

- `DocumentManager` -- document representation
- `Scheduler` -- incremental static dependency analysis
- `ExecutionManager` -- maintains Coq states
- `DelegationManager` -- coordinates workers

**Client:** Two React webview panels (goal-view-ui, search-view-ui) using atomic design pattern.

**Protocol:** Standard LSP plus custom extensions over JSON-RPC.

### coq-lsp (rocq-lsp)

Key design: treats a Coq document as a build task, not a continuously-checked stream. Checks only the required prefix
when the user requests goals.

**Custom extensions:**

- `proof/goals` -- returns goals, stacks, shelf goals, given-up goals, messages, errors
- `$/coq/fileProgress` -- processed ranges with progress kind
- `coq/viewport` -- tells the server what the user sees (for on-demand checking)

**Proof state references:** Server-side objects represented by integer IDs (same as Lean's `RpcPtr`).

______________________________________________________________________

## Agda and Idris 2

### Agda (agda-mode-vscode)

- **Not LSP.** Uses Agda's built-in interaction protocol (IOTCM commands).
- Written in ReScript with React UI.
- Spawns an Agda process, communicates via pipe/TCP/WASM.
- Command-response model: user issues command (load, give, refine, case-split), Agda responds.
- Goals (`{! !}`) tracked in AVL tree. State per file, displayed via webview.
- Singleton webview panel shared across documents.

### Idris 2

Two extensions:

- **idris-vscode:** Uses Idris IDE Protocol (s-expression-based, not LSP). Custom protocol for type checking, proof
    search, case splitting.
- **idris2-lsp-vscode:** Uses a proper LSP server (`idris2-lsp`) with standard features plus semantic highlighting.

______________________________________________________________________

## Cross-cutting patterns

### Protocol choice

Every mature proof assistant uses LSP + custom extensions. Standard LSP gives diagnostics, hover, go-to-definition,
completions. Custom extensions add proof-specific features.

### Server architecture

Two models:

- **Watchdog + per-file workers** (Lean 4) -- maximum isolation, crash containment
- **Single server with scheduler** (VsCoq 2, coq-lsp) -- simpler, sufficient for most languages

### Incremental checking

- **Lean 4:** Snapshot tree per file, per-command granularity, eager elaboration
- **coq-lsp:** On-demand checking, elaborate only what the user looks at
- **Agda:** Full file re-check on each load

### Goal/proof state display

All proof assistants use a custom webview panel. This is the only way to render structured, interactive proof state.
React is the dominant framework.

### RPC pointer pattern

Both Lean 4 and coq-lsp use opaque server-side pointers for proof state objects. Never serialize large environments --
send handles and render on demand.

### "Try This" / code action pattern

Surface suggestions as both infoview clickable text and standard LSP `textDocument/codeAction`.

### File progress indication

Custom LSP notification reporting per-range checking status. Extension renders as gutter decorations.

______________________________________________________________________

## Recommendations for Musa

### Protocol

LSP + custom extensions (prefixed `$/musa/` for notifications, `musa/` for requests). Implement standard LSP features in
the server, then add:

| Extension            | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `$/musa/fileProgress` | Per-declaration type-checking progress                     |
| `musa/proofState`     | Goal state at cursor (typed holes, context, expected type) |
| `musa/viewCBPV`       | Value/computation split for a term                         |
| `musa/viewEffects`    | Inferred effect rows                                       |
| `musa/viewGrades`     | Resource usage grades                                      |
| `musa/expandHandler`  | Expand effect handler clauses                              |
| `musa/normalForm`     | Normalized/evaluated form                                  |

### Server architecture

Start with single-process server (current architecture). Musa files are smaller than Lean mathlib files. Add process
isolation later if needed.

### Incremental checking

Per-declaration snapshots (similar to Lean). Maps naturally to Musa's top-level definitions. The `DocumentManager` in
`crates/tools/lsp/` already caches per-document compilation state -- extend this to per-declaration granularity.

### InfoView panel

React webview for displaying:

- **Proof state** -- typed holes with expected type, available bindings, grades
- **Effect information** -- inferred effect rows for the current expression
- **CBPV split** -- whether a term is a value or computation, and its type
- **Grade annotations** -- resource usage at each binding

Architecture: extension host bridges postMessage (webview) \<-> custom LSP requests (server). Follow Lean's
`EditorApi`/`InfoviewApi` pattern.

### RPC pointers

Implement from the start. Musa's graded contexts and effect rows are too large to serialize on every cursor move. Expose
them as RPC handles:

1. `musa/proofState(position)` -> `{ goalHandle: number, ... }`
1. `musa/renderGoal(goalHandle)` -> formatted output

### File progress

Implement `$/musa/fileProgress` early. Users need to know which declarations have been type-checked, especially since
graded type checking can be slow.

### Technology choices

- Extension: TypeScript
- InfoView: React (follow the established pattern)
- Server: Rust (reuse compiler directly)
- Communication: stdio transport, JSON-RPC
