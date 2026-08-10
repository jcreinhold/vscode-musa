# AGENTS.md — vscode-musa

VS Code extension for the [musa](https://github.com/jcreinhold/musa) language: diagnostics, hover, formatting,
completion, quick fixes, and references from the musa language server (`musa-lsp`). A thin TypeScript client — all
smarts live server-side in the musa repo.

## The documents that govern this repo

- **`../musa/AGENTS.md`** (a musa checkout) — the architecture and standards. This extension obeys them.
- **`../musa/docs/language/`** and **`docs/language-correction.md`** — the surface language this extension highlights
  and completes.
- **`.claude/skills/vscode-extension/SKILL.md`** — the extension-development playbook (manifest fields, esbuild, LSP
  client patterns, packaging). Read it before changing extension code.

If code and these documents disagree, either the code is wrong or the document needs a deliberate repair.

## Layout

| Path | What lives there |
| --- | --- |
| `src/extension.ts` | thin entry point, delegates to `client.ts` |
| `src/client.ts` | LanguageClient setup and musa-lsp binary discovery |
| `build/generate-grammar.js` | generator for the TextMate grammar — the only place grammar changes happen |
| `syntaxes/musa.tmLanguage.json` | generated grammar output; never edit by hand |
| `language-configuration.json` | comments, brackets, indentation |
| `test/` | unit tests (`node --test`) |
| `dist/` | esbuild output |

## Commands

```sh
npm run check          # tsc --noEmit + grammar:check
npm run compile        # check + esbuild bundle
npm run package        # production bundle (runs on vscode:prepublish)
npm run grammar        # regenerate the TextMate grammar from build/generate-grammar.js
npm run grammar:check  # verify committed grammar matches its generator
npm test               # node --test
vsce package           # create .vsix
```

`npm run check` must be green before committing.

## Standards

- **The source is canonical.** `.musa` text is the only artifact; every feature is a projection of `musa-lsp` facts.
  No second AST in the extension.
- **Thin client.** Push analysis into `crates/musa-lsp` (musa repo); the extension hosts the client, settings, and
  webviews only.
- **The grammar is generated.** Edit `build/generate-grammar.js`, then `npm run grammar`. `grammar:check` is part of
  `npm run check` and fails on hand edits.
- **Bundle with esbuild**, `external: ["vscode"]`, CJS, `platform: "node"`.
