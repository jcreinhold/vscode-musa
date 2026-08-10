# Language Server Protocol Reference

## Table of contents

1. [Protocol fundamentals](#protocol-fundamentals)
1. [Lifecycle](#lifecycle)
1. [Core features](#core-features)
1. [Advanced features (3.17+)](#advanced-features)
1. [Custom extensions](#custom-extensions)
1. [Rust LSP frameworks](#rust-lsp-frameworks)
1. [Server architecture patterns](#server-architecture-patterns)
1. [Incremental analysis](#incremental-analysis)
1. [Error recovery](#error-recovery)

______________________________________________________________________

## Protocol fundamentals

LSP uses JSON-RPC 2.0 over a transport (stdio, socket, pipe). Messages are wrapped in HTTP-style headers with a
mandatory `Content-Length` field.

Three message types:

- **Request** -- has `id`, requires a response
- **Notification** -- no `id`, no response expected
- **Response** -- matches a request by `id`, carries `result` or `error`

### Position encoding

Client and server negotiate offset encoding via `general.positionEncodings` during initialization. Options: `utf-8`,
`utf-16` (default), `utf-32`. For Rust servers, negotiate `utf-8` to avoid offset translation overhead.

______________________________________________________________________

## Lifecycle

1. **Client sends `initialize`** -- includes `processId`, `rootUri`, `workspaceFolders`, and `capabilities` (what the
   client supports)
1. **Server responds** -- declares its own `capabilities` (what features it will provide)
1. **Client sends `initialized`** -- server can now send requests to client
1. **Normal operation** -- requests, responses, and notifications flow both directions
1. **Client sends `shutdown`** -- server stops accepting new requests
1. **Client sends `exit`** -- server terminates (code 0 if shutdown succeeded, 1 otherwise)

### Capabilities negotiation

Neither side implements everything. The client announces support (e.g.,
`textDocument.completion.completionItem.snippetSupport: true`), and the server responds with the features it provides.
This is how optional features are discovered.

Dynamic registration: the server can register/unregister capabilities at runtime via `client/registerCapability`. This
avoids declaring capabilities the server only sometimes provides.

______________________________________________________________________

## Core features

### Document synchronization

| Method | Direction | Purpose |
| --- | --- | --- |
| `textDocument/didOpen` | C -> S | Document opened, full text sent |
| `textDocument/didChange` | C -> S | Document changed (full or incremental) |
| `textDocument/didSave` | C -> S | Document saved |
| `textDocument/didClose` | C -> S | Document closed |
| `textDocument/willSave` | C -> S | About to save |

**Sync modes:** `TextDocumentSyncKind.Full` sends entire text on each change. `Incremental` sends only the edited range.
Incremental is better for performance but requires the server to maintain document state.

### Diagnostics (push model)

Server pushes `textDocument/publishDiagnostics` whenever diagnostics change:

```json
{
  "uri": "file:///path/to/file.musa",
  "diagnostics": [{
    "range": { "start": { "line": 3, "character": 5 }, "end": { "line": 3, "character": 15 } },
    "severity": 1,
    "source": "musa",
    "message": "Type mismatch: expected Int64, found String",
    "code": "E0308",
    "relatedInformation": [{ "location": {...}, "message": "expected due to this" }],
    "tags": []
  }]
}
```

Severity levels: 1 = Error, 2 = Warning, 3 = Information, 4 = Hint. Tags: 1 = Unnecessary (grayed out), 2 = Deprecated
(strikethrough).

### Completion

`textDocument/completion` returns `CompletionItem[]` or `CompletionList`.

Key item fields:

- `label` -- display text
- `kind` -- Function, Variable, Keyword, Snippet, etc.
- `detail` -- type signature or short description
- `documentation` -- full documentation (markdown supported)
- `insertText` / `textEdit` -- what gets inserted
- `insertTextFormat` -- PlainText or Snippet
- `commitCharacters` -- characters that auto-accept (e.g., `.`, `(`)
- `sortText` -- custom sort order

Lazy resolution: set `completionProvider.resolveProvider: true` and implement `completionItem/resolve` to defer
expensive fields (documentation, additional edits).

Trigger characters: declare in `completionProvider.triggerCharacters` (e.g., `["."]`).

### Hover

`textDocument/hover` returns markdown content at a position:

````json
{
  "contents": {
    "kind": "markdown",
    "value": "```musa\nfn add(x: Int64, y: Int64) -> Int64\n```\nAdds two integers."
  },
  "range": { "start": { "line": 5, "character": 4 }, "end": { "line": 5, "character": 7 } }
}
````

### Go to definition / references

- `textDocument/definition` -- returns `Location` or `LocationLink[]`
- `textDocument/typeDefinition` -- go to type definition
- `textDocument/implementation` -- go to implementation
- `textDocument/references` -- find all references
- `textDocument/declaration` -- go to declaration

`LocationLink` includes `originSelectionRange` for peek navigation.

### Rename

- `textDocument/prepareRename` -- validate the symbol can be renamed
- `textDocument/rename` -- return a `WorkspaceEdit` with all changes

### Code actions

`textDocument/codeAction` returns actions for a range or diagnostic:

```json
{
  "title": "Fill hole with `x + y`",
  "kind": "quickfix",
  "diagnostics": [{ ... }],
  "edit": {
    "changes": {
      "file:///path/to/file.musa": [{
        "range": { ... },
        "newText": "x + y"
      }]
    }
  }
}
```

Action kinds: `quickfix`, `refactor`, `refactor.extract`, `refactor.inline`, `refactor.rewrite`, `source`,
`source.organizeImports`, `source.fixAll`.

### Code lenses

`textDocument/codeLens` returns inline annotations (e.g., "3 references", "Run test"). Each lens has a range and a
command. Use `codeLens/resolve` for lazy command resolution.

### Semantic tokens

`textDocument/semanticTokens/full` returns all tokens encoded as a flat integer array. Each token is 5 values:
`[deltaLine, deltaStartChar, length, tokenType, tokenModifiers]`.

The legend (mapping indices to type/modifier names) is declared in server capabilities.

Incremental updates: `semanticTokens/full/delta` returns only changes from the previous result.

### Inlay hints

`textDocument/inlayHint` returns inline annotations (type hints, parameter names):

```json
{
  "position": { "line": 3, "character": 15 },
  "label": ": Int64",
  "kind": 1,
  "tooltip": { "kind": "markdown", "value": "Inferred type" },
  "paddingLeft": true
}
```

Kind: 1 = Type, 2 = Parameter.

### Document symbols

`textDocument/documentSymbol` returns either flat `SymbolInformation[]` or hierarchical `DocumentSymbol[]`.

Symbol kinds: File, Module, Namespace, Package, Class, Method, Property, Field, Constructor, Enum, Interface, Function,
Variable, Constant, String, Number, Boolean, Array, Object, Key, Null, EnumMember, Struct, Event, Operator,
TypeParameter.

### Formatting

- `textDocument/formatting` -- format entire document
- `textDocument/rangeFormatting` -- format selection
- `textDocument/onTypeFormatting` -- format on keystroke (e.g., after `}`)

______________________________________________________________________

## Advanced features

### Pull diagnostics (3.17)

Instead of push, the client requests diagnostics:

- `textDocument/diagnostic` -- per-document diagnostics
- `workspace/diagnostic` -- workspace-wide diagnostics
- `workspace/diagnostic/refresh` -- server signals staleness

Better for expensive diagnostics that should not run on every keystroke. Supports partial results via `$/progress`.

### Type hierarchy (3.17)

Three-step protocol:

1. `textDocument/prepareTypeHierarchy` -- returns initial item
1. `typeHierarchy/supertypes` -- navigate up
1. `typeHierarchy/subtypes` -- navigate down

### Call hierarchy (3.16)

Same three-step pattern:

1. `textDocument/prepareCallHierarchy`
1. `callHierarchy/incomingCalls`
1. `callHierarchy/outgoingCalls`

### Inline values (3.17)

`textDocument/inlineValue` provides debug-time inline value display. Supports `workspace/inlineValue/refresh`.

### Notebook support (3.17)

Full parallel sync protocol for notebook cells: `notebookDocument/didOpen`, `didChange`, `didSave`, `didClose`.

### Linked editing ranges (3.16)

`textDocument/linkedEditingRange` for synchronized editing of related ranges (e.g., matching tags).

______________________________________________________________________

## Custom extensions

The LSP spec allows custom methods. Any method name is valid for extensions.

### Convention from rust-analyzer

- `experimental/*` -- features intended to become standard LSP (e.g., `experimental/parentModule`,
  `experimental/joinLines`)
- `rust-analyzer/*` -- permanently language-specific (e.g., `rust-analyzer/syntaxTree`, `rust-analyzer/viewHir`,
  `rust-analyzer/expandMacro`)

### Negotiation

Custom capabilities are exchanged via the `experimental` field in `ClientCapabilities` and `ServerCapabilities`:

```json
{
  "experimental": {
    "musaFileProgress": true,
    "musaViewTimeline": true,
    "musaViewTimeline": true
  }
}
```

### Musa-specific custom extensions

Suggested custom notifications and requests:

| Method | Direction | Purpose |
| --- | --- | --- |
| `$/musa/fileProgress` | S -> C | Report per-declaration type-checking progress |
| `musa/viewTimeline` | C -> S | Show the elaborated kernel timeline for a part |
| `musa/viewEffects` | C -> S | Display inferred effect rows |
| `musa/viewGrades` | C -> S | Show resource usage grades |
| `musa/expandHandler` | C -> S | Expand effect handler clauses |
| `musa/viewNormalForm` | C -> S | Show normalized form of an expression |
| `musa/proofState` | C -> S | Get proof state at cursor (goals, context, type) |

### Implementation pattern

Define custom request/notification types. Never make internal analysis types directly serializable -- create separate
protocol types with explicit conversion (the `from_proto`/`to_proto` pattern from rust-analyzer).

```rust
// In your LSP crate, not in compiler core
mod protocol {
    use serde::{Deserialize, Serialize};

    #[derive(Serialize, Deserialize)]
    pub struct FileProgressParams {
        pub uri: String,
        pub ranges: Vec<ProgressRange>,
    }

    #[derive(Serialize, Deserialize)]
    pub struct ProgressRange {
        pub range: lsp_types::Range,
        pub kind: ProgressKind,
    }

    #[derive(Serialize, Deserialize)]
    pub enum ProgressKind {
        Processing,
        Checked,
        Error,
    }
}
```

______________________________________________________________________

## Rust LSP frameworks

### tower-lsp (current: 0.20)

High-level trait-based API built on Tower + Tokio. You implement `trait LanguageServer` with async methods.

**Strengths:** Rapid development, clean API, handles protocol details.

**Weaknesses:** `&self` receiver means state mutation needs async locks (`DashMap`, `RwLock`). Notifications processed
async, potential out-of-order issues.

```rust
use tower_lsp::{jsonrpc, lsp_types::*, Client, LanguageServer, LspService, Server};

struct Backend { client: Client, documents: DashMap<Url, DocumentState> }

#[tower_lsp::async_trait]
impl LanguageServer for Backend {
    async fn initialize(&self, _: InitializeParams) -> jsonrpc::Result<InitializeResult> {
        Ok(InitializeResult {
            capabilities: ServerCapabilities {
                text_document_sync: Some(TextDocumentSyncCapability::Kind(
                    TextDocumentSyncKind::INCREMENTAL,
                )),
                hover_provider: Some(HoverProviderCapability::Simple(true)),
                completion_provider: Some(CompletionOptions {
                    trigger_characters: Some(vec![".".into()]),
                    ..Default::default()
                }),
                ..Default::default()
            },
            ..Default::default()
        })
    }

    async fn hover(&self, params: HoverParams) -> jsonrpc::Result<Option<Hover>> {
        // Look up type info from compiled state
        Ok(None)
    }
    // ...
}
```

### tower-lsp-server (community fork)

Continued maintenance of tower-lsp. Key changes:

- Dropped `#[async_trait]` for native Rust async trait (RPITIT)
- Uses `ls-types` fork (maintained) instead of `lsp-types` (unmaintained)
- Plans codegen from LSP meta-model

Consider migrating when tower-lsp 0.20 becomes a maintenance burden.

### lsp-server (rust-analyzer's crate)

Minimal scaffolding. Synchronous `crossbeam-channel` API. You control the dispatch loop.

**Strengths:** Maximum control over scheduling, cancellation. No async runtime. Battle-tested.

**Weaknesses:** More boilerplate. Manual request/response matching.

```rust
use lsp_server::{Connection, Message, Request, Response};

fn main() {
    let (connection, io_threads) = Connection::stdio();
    let caps = serde_json::to_value(ServerCapabilities { ... }).unwrap();
    connection.initialize(caps).unwrap();

    for msg in &connection.receiver {
        match msg {
            Message::Request(req) => { /* dispatch by method */ },
            Message::Notification(not) => { /* handle */ },
            _ => {},
        }
    }
}
```

### async-lsp

Tower-based like tower-lsp, but with key corrections:

- Notifications processed synchronously/in-order (correct per spec)
- `&mut self` handlers -- no async locks needed
- Supports both server and client roles
- Composable via Tower `Layer` middleware

Worth evaluating if notification ordering or `&mut self` state access becomes a pain point.

### lsp-types

Rust type definitions for LSP structures. The `gluon-lang/lsp-types` crate covers LSP 3.17 but is largely unmaintained.
The community maintains `ls-types` as a fork.

### Recommendation for musa-lsp

The existing `tower-lsp 0.20` choice is reasonable for the current feature set. If you hit pain points:

- **Notification ordering issues** -> consider `async-lsp`
- **Need maintenance** -> consider `tower-lsp-server` (community fork)
- **Need full control** -> consider `lsp-server` (larger rewrite)

______________________________________________________________________

## Server architecture patterns

### Snapshot pattern (rust-analyzer)

`AnalysisHost` holds mutable state. `Analysis` is a cheap immutable snapshot (via `Arc`). Background threads work on
snapshots while the main loop processes events.

```
Main thread: process events, create snapshots
Background threads: run analysis on snapshots
```

Fast requests (hover, symbols) run on the main thread. Slow requests (completion, rename) spawn to background.

### Cancellation (rust-analyzer)

Salsa bumps a global revision counter when inputs change. Background threads detect this and panic with `Cancelled`. The
`ide` layer catches this and returns an appropriate LSP error.

### Robustness pattern

Functions return `(T, Vec<Error>)` not `Result<T, Error>`. Partial results are always available, even from broken code.
This is essential for IDE experience -- the server must produce useful output even when the file has errors.

### Layered architecture

Only the LSP crate knows about JSON-RPC and protocol types. IDE features live in a separate crate using plain data
types. Conversion between protocol types and internal types happens in `from_proto`/`to_proto` modules.

```
vfs (virtual file system)
  -> base_db (inputs)
  -> hir (semantic model)
  -> ide (IDE features, plain types)
  -> lsp (protocol conversion, JSON-RPC)
```

______________________________________________________________________

## Incremental analysis

### Salsa (memoized query framework)

Define your program as queries (`K -> V`). Salsa memoizes results and uses the red-green algorithm to decide what to
recompute when inputs change.

Key concepts:

- **Input structs** -- starting points (source file contents)
- **Tracked functions** -- `#[salsa::tracked]` memoized functions
- **Tracked structs** -- intermediate immutable values, matched across executions by `#[id]` fields
- **Interned structs** -- canonicalized values for cheap equality
- **Database** -- central storage holding everything

**Durability optimization:** Queries are assigned tiers (e.g., stdlib = durable, user files = volatile). When volatile
inputs change, durable queries skip revalidation.

### Tree-sitter integration

For incremental parsing:

1. Maintain a `tree_sitter::Tree` per open document
1. On `didChange`, apply edits via `tree.edit()`
1. Re-parse with `parser.parse(new_text, Some(&old_tree))`
1. Typically < 1ms per update

Tree-sitter and Salsa are complementary: tree-sitter for incremental parsing, Salsa for incremental semantic analysis.

______________________________________________________________________

## Error recovery

### Core principle

Language server code should always produce partial results:

```rust
fn analyze(input: &str) -> (Module, Vec<Diagnostic>) {
    // NOT: fn analyze(input: &str) -> Result<Module, Error>
    // Always return both a best-effort result and accumulated errors
}
```

### Resilient parsing patterns

- Emit flat events (Open, Close, Advance) instead of directly building a tree
- Recovery sets (from follow sets) determine when to skip tokens vs. break
- Each loop iteration must consume at least one token (prevent infinite loops)
- Recognize valid prefixes of constructs (critical for completion)
- Preserve all tokens in the tree, including erroneous ones
- Mark error nodes but keep surrounding structure intact
- Localize errors so a mistake in one function doesn't break parsing of others

### Completion in broken code

The server must infer context from partial parse trees. If the user typed `foo.` and stopped:

- The parser should recognize this as member access with missing member name
- The completion engine should use the type of `foo` to provide suggestions
- Error recovery around the dot prevents the parse error from cascading
