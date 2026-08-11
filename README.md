# vscode-musa

Language support for [musa](https://github.com/jcreinhold/musa) — the notation-first music language — in VS Code:
diagnostics, hover, formatting, completion, quick fixes, references, rename, folding, and semantic tokens from the musa
language server, over instant TextMate highlighting.

The extension owns no vocabulary and no musical knowledge:

- **Highlighting** is a *generated* TextMate grammar (`syntaxes/musa.tmLanguage.json`), built by
  `build/generate-grammar.js` from the musa repository's committed highlighting fixtures — the same `spellings.json` /
  `token-classes.json` the desktop editor is generated from. A stale grammar fails `npm run check`. The server's
  **semantic tokens** refine the highlighting once it is running, and killing the server leaves the TextMate layer
  standing.
- **Everything else** is the prompt-77 language server (`musa-lsp`) answering over stdio. The extension is a launcher
  and a registration.

Two of those registrations are worth naming, because they are the only places the extension puts anything on screen that
VS Code would not show by itself:

- **The standard library opens read-only.** Go-to-definition on an imported name lands in `musa-stdlib:/std/…`, a module
  whose text is compiled into the server binary. A content provider asks the server for that text (`musa.bundledSource`)
  and shows it in a document VS Code will not let you edit — which is the truth, since an edit would have nowhere to
  land. The extension carries no copy of the standard library.
- **Analysis is asked for, and shown as a report.** The server offers one code lens per analysis kind; the lens runs
  `musa.analyze`, and the typed report it answers with is rendered as markdown beside the source. It never reaches the
  Problems pane: a cadence with two of its three kinds of evidence is a finding with an absence recorded, not a mistake.
  Every sentence in the report is the server's own.

## Install

1. Build the server, in a checkout of the musa repository:

   ```sh
   cargo build --release -p musa-lsp
   ```

2. Either put `target/release/musa-lsp` on your `PATH`, or point the extension at it:

   ```json
   "musa.server.path": "/path/to/musa/target/release/musa-lsp"
   ```

3. Install the extension from the packaged VSIX:

   ```sh
   npm install
   npm run package
   npx vsce package
   code --install-extension vscode-musa-0.1.0.vsix
   ```

If the server is missing, the extension says so once and tells you this — it never downloads anything.

## Develop

```sh
npm install
npm run check        # types + the grammar's freshness law
npm run test         # the generator's unit tests
npm run grammar      # regenerate the TextMate grammar from the musa fixtures (MUSA_REPO=../musa)
```

One command in the palette: **Musa: Restart Language Server**. `musa.analyze` and `musa.bundledSource` are registered
too, but they are the server's to invoke — from a code lens and from a definition link — so they are deliberately not in
the palette, where they would need arguments a person has no way to supply.

`SMOKE.md` is the manual checklist for what the protocol laws cannot see: whether VS Code actually shows what the server
answers.

## What this extension does not do

No score preview, no playback, no engraving — the musa desktop app owns the page. No marketplace publishing, no
auto-downloaded binaries.
