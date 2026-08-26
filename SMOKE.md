# Manual smoke: the elaboration language in VS Code

Automated protocol laws live in the musa repository (`crates/musa-lsp/tests/lsp_laws.rs`) and cover every answer the
server gives. What they cannot cover is whether VS Code *shows* those answers — a registered provider, a scheme that
opens, a lens that fires. That is what this checklist is for. Run it whenever `src/` changes or the server's capability
set does.

## Setup

```sh
cargo build --release -p musa-lsp   # in the musa checkout
npm install && npm run compile
```

Open this folder in VS Code and press <kbd>F5</kbd> to launch the Extension Development Host. In it, open
`../musa/examples/module-functor-study.musa`.

## Checklist

Each line is one observation. A failure is a bug in this repository unless the same request fails in the musa
repository's law tests, in which case it is a bug there.

- [ ] **The server is running.** The `musa language server` output channel says `language server running: …`, and no
      error notification appeared.
- [ ] **Diagnostics.** Delete a `;`. A red squiggle appears within a keystroke or two, with a teaching message. Undo;
      it clears.
- [ ] **Hover, type-aware.** Hover `subject` inside `template structure Canon`. The popup shows `let subject: Music`
      and the comment written above it.
- [ ] **Hover, domain distinction.** Hover a `NoteName`-typed binding (`CMajor.tonic`). The popup distinguishes it from
      `Pc12` — "a letter and an accidental, with no octave".
- [ ] **Hover, standard library.** In a piece that writes `import std::core;`, hover an imported name. The popup says
      *Bundled Musa source · read-only* and carries a link.
- [ ] **Bundled navigation.** Follow that link, or press <kbd>F12</kbd> on the imported name. A `musa-stdlib:` document
      opens showing the module's Musa source, highlighted, and typing into it does nothing — the editor refuses the
      edit.
- [ ] **Signature help.** Type `transposed(` inside a `music` context. The parameter list appears; typing a `,` moves
      the highlight to the next parameter.
- [ ] **Completion, named parameters.** Inside a call to a declared function, the parameter names appear first in the
      menu, as `name:`, with the default shown where there is one.
- [ ] **Sound declaration help.** Open `../musa/examples/glass-mountain.musa`. Hover `lowpass`; the popup gives the
      checked source signature, exact unit/default/range facts, source origin, and registered primitive support. Inside
      its call, `resonance:` completes before the general vocabulary and no `q:` alias appears.
- [ ] **Instrument contract.** Hover the selected instrument and inspect completion around its sound binding. The editor
      names the source declaration/profile and exposed controls; it does not present private graph paths as musical
      controls or call the part a track.
- [ ] **Foreign adapter and asset state.** In a project containing an `instrument ... from` declaration, hover an SFZ
      or SoundFont instrument. The popup labels `sfz@1` or `sf2@1`, the checked sample-map result, named refusal classes,
      and the current verified/missing/unlocked/digest asset state. The extension does not open or parse the foreign file.
- [ ] **Mix and media vocabulary.** Completion and hover explain `room`, `bus`, `send`, `route`, `clip`, and
      `fixed_media` from server/source facts. A musical clip is described in performed beats; a fixed-media cue is
      described in physical time.
- [ ] **Completion, policies.** Inside `assert realizes(chord c major, ` the three realization policies appear at the
      top of the menu, and nothing else new does.
- [ ] **Completion, kernel holes.** In `../musa/examples/kernel-splice.musa`, inside `${` the music-typed bindings sort
      to the top.
- [ ] **Outline.** The breadcrumb / Outline pane lists `signature CanonMaterial`, `template Canon`, the `make`
      instances, and the piece's sections. Clicking one jumps to it.
- [ ] **Rename across a template.** Rename `Canon` from a `make` site. Both `make` statements and the template's own
      name change, and nothing else does.
- [ ] **Rename is refused on the standard library.** Try to rename an imported bundled name. VS Code shows the server's
      refusal naming `read-only`, and no edit is applied.
- [ ] **Quick fix, certain only.** With a missing `;`, the lightbulb offers **add `;`**. In a piece whose stacked chord
      has no register, the diagnostic appears with *no* quick fix — the octave is the composer's choice, and the editor
      must not guess it.
- [ ] **Analysis lens.** Above `piece`, a row of `Analyze: …` lenses appears. Click `Analyze: chords`. A markdown
      preview opens beside the source, listing the method, the assumptions, and the findings with their criteria.
- [ ] **Analysis does not become an error.** After running an analysis, the Problems pane is unchanged. An observation
      is not a mistake.
- [ ] **Kernel documents.** Open a `.musa.kernel` file. Highlighting and the outline answer; hover and completion do
      not offer surface-language names, because a kernel document has none.
- [ ] **Stale semantic answers.** Break the current source after one successful compile. Sound hover/navigation keeps
      answering from the last valid artifact with its stale revision relationship, while asset status reflects the
      current verified closure.

## Recording a run

Note the date, the VS Code version, and the musa commit the server was built from. A checklist run against an unknown
server build proves nothing.
