# Golden Example Extensions

Architecture patterns from the best-maintained VS Code language extensions.

## Table of contents

1. [rust-analyzer (Rust)](#rust-analyzer)
1. [vscode-lean4 (Lean 4)](#vscode-lean4)
1. [Other notable references](#other-references)
1. [Pattern summary](#pattern-summary)

______________________________________________________________________

## rust-analyzer

**Repository:** `rust-lang/rust-analyzer` (`editors/code/` directory)

The gold standard for a Rust-based LSP extension. Most relevant for understanding how to build a language server in Rust
and connect it to VS Code.

### Extension structure

- Uses `vscode-languageclient` v9.0.1 with stdio transport
- Targets `engines.vscode: "^1.93.0"`
- CJS format (`"type": "commonjs"`), TypeScript, esbuild
- Entry point delegates to a `Ctx` class that manages the `LanguageClient`
- Extensive `contributes.configuration` (hundreds of settings)
- Custom semantic token types and modifiers
- 50+ registered commands

### Server architecture principles

1. **Explicit event loop.** Single-threaded main loop using `crossbeam_channel::select!`. All triggers visible in one
   place. No hidden async.

1. **Snapshot pattern.** `AnalysisHost` = mutable state. `Analysis` = cheap immutable snapshot (via `Arc`). Background
   threads work on snapshots. Main loop processes events.

1. **Request dispatch.** Type-safe `RequestDispatcher` with fluent API:

    ```rust
    dispatcher
        .on::<lsp_types::request::HoverRequest>(handlers::handle_hover)
        .on::<lsp_types::request::Completion>(handlers::handle_completion)
        .finish();
    ```

    Fast requests run on main thread. Slow requests spawn to background.

1. **Cancellation via Salsa.** Input changes bump a global revision counter. Background threads detect this and panic
   with `Cancelled`. The `ide` layer catches it.

1. **Robustness.** Functions return `(T, Vec<Error>)` not `Result<T, Error>`. Partial results always available, even
   from broken code.

1. **Separation of concerns.** Only `rust-analyzer` crate knows about LSP/JSON. The `ide` crate provides analysis using
   plain data types. `from_proto`/`to_proto` modules handle conversion (including UTF-16 offset translation).

1. **Push diagnostics.** Computed proactively when system becomes quiescent, then pushed to client.

### Custom LSP extensions

Two namespaces:

- `experimental/*` -- features intended for upstream LSP (parentModule, joinLines, runnables, matchingBrace, onEnter,
  externalDocs)
- `rust-analyzer/*` -- permanently Rust-specific (syntaxTree, viewHir, expandMacro, reloadWorkspace, analyzerStatus,
  relatedTests, openCargoToml)

All negotiated via `experimental` capabilities field.

### Layered architecture

```
vfs (virtual file system)
  -> base_db (salsa inputs)
  -> hir (semantic model)
  -> ide (IDE features, plain types)
  -> rust-analyzer (LSP glue, protocol conversion)
```

### Key takeaways for Musa

- Separate protocol types from compiler internals. Never serialize `musa-core` types directly.
- Use the snapshot pattern for concurrent analysis.
- Implement partial results from broken code as a first-class concern.
- Start with push diagnostics; add pull diagnostics later for expensive checks.

______________________________________________________________________

## vscode-lean4

**Repository:** `leanprover/vscode-lean4`

The most relevant reference for building a proof-assistant VS Code extension. See
`references/proof-assistant-patterns.md` for full architectural details.

### Extension structure

- Lerna monorepo: extension + React infoview + shared types + Unicode input
- Uses `vscode-languageclient` v9.0.1
- Webpack bundled
- 80+ commands, 40+ configuration properties
- Three language IDs: `lean4`, `lean`, `lean4markdown`
- Custom webview panel for interactive proof state

### Key patterns

1. **Three-process architecture.** Extension Host (Node.js) + Webview (React) + Language Server (Lean). Extension
   bridges the other two.

1. **RPC pointer pattern.** Opaque server-side handles for proof state objects. Never serialize large environments.

1. **File progress notification.** Custom `$/lean/fileProgress` for per-range checking status, rendered as gutter
   decorations.

1. **Multi-project support.** Map from folder URIs to client instances. Each project gets its own server.

1. **Two-phase activation.** Always-enabled features (PATH, installers, commands) + deferred features (project
   detection, server launch).

### Key takeaways for Musa

- The infoview architecture (React webview + postMessage + RPC) is the proven pattern for proof state display.
- File progress indication is essential for any language with expensive type checking.
- The RPC pointer pattern is necessary for languages with rich elaboration state.

______________________________________________________________________

## Other references

### vscode-haskell

**Repository:** `haskell/vscode-haskell`

Clean, simple "thin client" extension wrapping the Haskell Language Server. Good example of minimal extension
architecture that delegates everything to the server.

- `vscode-languageclient` v7.0.0
- Automatic HLS binary installation via GHCup
- Standard architecture: single entry point, single language server connection

### clangd (vscode-clangd)

**Repository:** `clangd/vscode-clangd`

Very clean, minimal client wrapping the clangd language server over stdio. Good "thin client" template.

### Go (vscode-go)

**Repository:** `golang/vscode-go`

Well-maintained, Microsoft-backed. Standard LSP architecture with gopls server.

### gopls (server side)

**Repository:** `golang/tools` (`gopls/` directory)

Key patterns:

- **Session/View/Snapshot hierarchy.** Session = client connection. View = workspace. Snapshot = immutable state at a
  point in time.
- **Content-hash invalidation.** File identity by URI + hash, not timestamps.
- **Pruning-based incremental rebuilds.** Skip recompilation when export summaries unchanged.
- **Persistent file cache.** Cross-process cache for type info. Makes second startup fast.

### Zig (zls-vscode)

**Repository:** `zigtools/zls-vscode`

Small, clean extension for a newer language. Good starting template for a simple language extension.

______________________________________________________________________

## Pattern summary

| Pattern | Used by | Relevance to Musa |
| --- | --- | --- |
| Snapshot-based concurrency | rust-analyzer, gopls | High -- safe concurrent analysis |
| Partial results from errors | rust-analyzer | High -- IDE must work with broken code |
| Separation of protocol/internals | rust-analyzer | High -- keep LSP details out of compiler |
| RPC pointers for proof state | Lean 4, coq-lsp | High -- avoid serializing large contexts |
| React webview for proof UI | Lean 4, VsCoq, Agda | High -- only way to render structured proof state |
| File progress notification | Lean 4, coq-lsp | High -- users need to see checking progress |
| Custom LSP extensions | rust-analyzer, Lean 4 | Medium -- needed for Musa-specific features |
| Multi-project support | Lean 4 | Medium -- needed for workspaces |
| Incremental query framework (Salsa) | rust-analyzer | Medium -- needed for large-scale performance |
| Automatic binary installation | vscode-haskell | Low -- Musa is cargo-installable |
| User widgets | Lean 4 | Low -- not needed initially |
