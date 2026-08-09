// The generator's laws (prompt 81): the grammar owns no vocabulary, so the
// tests hold it to the fixtures and to itself.

'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { build, SCOPES } = require('../build/generate-grammar.js');

const FIXTURES = process.env.MUSA_REPO
  ? join(process.env.MUSA_REPO, 'apps/musa-desktop/ui/src/lib/session/generated')
  : join(__dirname, '..', '..', 'musa', 'apps/musa-desktop/ui/src/lib/session/generated');

function fixtures() {
  return {
    spellings: JSON.parse(readFileSync(join(FIXTURES, 'spellings.json'), 'utf8')),
    classes: JSON.parse(readFileSync(join(FIXTURES, 'token-classes.json'), 'utf8')),
  };
}

test('every token class has a scope', () => {
  const { spellings, classes } = fixtures();
  for (const name of classes) {
    assert.ok(name in SCOPES, `TokenClass "${name}" has no scope`);
  }
  // And no spelling claims a class the lexer does not name.
  for (const [text, className] of spellings) {
    assert.ok(classes.includes(className), `"${text}" claims unknown class "${className}"`);
  }
  assert.doesNotThrow(() => build(spellings, classes));
});

test('the grammar is deterministic', () => {
  const { spellings, classes } = fixtures();
  assert.equal(
    JSON.stringify(build(spellings, classes)),
    JSON.stringify(build(spellings, classes)),
  );
});

test('every keyword the fixture spells is in the keyword pattern', () => {
  const { spellings, classes } = fixtures();
  const grammar = build(spellings, classes);
  const keywordRule = grammar.repository.keywords.patterns[0].match;
  for (const [text, className] of spellings) {
    if (className === 'keyword') {
      assert.ok(keywordRule.includes(`|${text}|`) || keywordRule.includes(`(${text}|`) || keywordRule.includes(`|${text})`),
        `keyword "${text}" missing from ${keywordRule}`);
    }
  }
  // `use` is its own class, exactly as TokenClass::Use says.
  assert.equal(grammar.repository.use.patterns[0].name, SCOPES.use);
});

test('the committed grammar is fresh', () => {
  const { spellings, classes } = fixtures();
  const committed = readFileSync(join(__dirname, '..', 'syntaxes', 'musa.tmLanguage.json'), 'utf8');
  assert.equal(committed, `${JSON.stringify(build(spellings, classes), null, 2)}\n`,
    'syntaxes/musa.tmLanguage.json is stale — run npm run grammar');
});

test('the patterns are valid regexes in the fixture’s own order', () => {
  const { spellings, classes } = fixtures();
  const grammar = build(spellings, classes);
  for (const rule of Object.values(grammar.repository)) {
    for (const pattern of rule.patterns ?? []) {
      for (const source of [pattern.match, pattern.begin, pattern.end].filter(Boolean)) {
        assert.doesNotThrow(() => new RegExp(source), source);
      }
    }
  }
});

test('a spelled punctuation mark is an operator, a bracket, or a separator', () => {
  const { spellings } = fixtures();
  const marks = spellings.filter(([, className]) => className === 'punctuation').map(([text]) => text);
  for (const mark of ['->', '|>', '=', '-', '~', '{', '}', '[', ']', '(', ')', ';', ',', ':', '.']) {
    assert.ok(marks.includes(mark), `the fixture lost "${mark}" — check the operator split in the generator`);
  }
});

// The two patterns no fixture can check.
//
// Keywords, units and punctuation come from `spellings.json`, so a change to
// the vocabulary shows up here as a failing diff. Pitch and duration do not:
// they are the lexer's own regexes transcribed by hand, and nothing in the
// fixtures would notice if they drifted. They did drift, twice, and this file
// passed through both — the accidental spelling moved from `fs3` to `f#3`,
// and durations grew the short form `c4/4`. So the transcription is pinned
// against spellings taken from the corpus itself.
test('the pitch and duration patterns paint the syntax the corpus is written in', () => {
  const { spellings, classes } = fixtures();
  const grammar = build(spellings, classes);
  const whole = (source) => new RegExp(`^(?:${source})$`);
  const pitch = whole(grammar.repository.pitch.patterns[0].match);
  const durations = grammar.repository.numbers.patterns
    .filter((rule) => rule.name === SCOPES.duration)
    .map((rule) => whole(rule.match));
  const painted = (text) => durations.some((rule) => rule.test(text));

  // `b` is both a letter and a flat: `b2` is B, `bb2` is B flat.
  for (const written of ['c4', 'a-1', 'a#5', 'ab3', 'b2', 'bb2', 'f##3', 'cn5']) {
    assert.ok(pitch.test(written), `"${written}" is a pitch the lexer accepts`);
  }
  // Both spellings of a duration, dots and all.
  for (const written of ['/1', '/16', '/2.', '/4..', '1/4', '3/8']) {
    assert.ok(painted(written), `"${written}" is a duration the lexer accepts`);
  }
  // And what is not a duration stays a plain number: a tempo is not a rhythm.
  assert.ok(!painted('96'), 'a metronome mark is a number');
  assert.ok(!painted('0.55'), 'a gain is a number');
});
