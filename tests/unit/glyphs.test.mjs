import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GLYPHS, GLYPH_H, layout, textWidth, parseRich, hasGlyph, advance } from '../../src/engine/glyphs.js';

// Rebuilds a laid-out line's text, putting spaces back where the gaps are.
function lineText(line) {
  let out = '';
  let prev = null;
  for (const g of line.glyphs) {
    if (prev && g.x > prev.x + advance(prev.ch)) out += ' ';
    out += g.ch;
    prev = g;
  }
  return out;
}

test('every glyph has 9 rows of equal width, drawn with # and .', () => {
  for (const [ch, g] of Object.entries(GLYPHS)) {
    assert.equal(g.rows.length, GLYPH_H, ch);
    for (const row of g.rows) {
      assert.equal(row.length, g.w, `glyph ${ch} row "${row}"`);
      assert.match(row, /^[#.]+$/, ch);
    }
  }
});

test('all printable ASCII is in the font', () => {
  for (let c = 32; c < 127; c++) assert.ok(hasGlyph(String.fromCharCode(c)), String.fromCharCode(c));
});

test('text width counts glyph widths, 1 px spacing and 3 px spaces', () => {
  assert.equal(textWidth(''), 0);
  assert.equal(textWidth('A'), 5);
  assert.equal(textWidth('AA'), 11);
  assert.equal(textWidth('A A'), 14);
  assert.equal(textWidth('{c:gold}A{/c}A'), 11);
});

test('tags: colour, shake, pause and the hero name', () => {
  const t = parseRich('Hi {c:gold}{hero}{/c}!{p:0.5} {shake}Oh{/shake}', { hero: 'Zed' });
  const chars = t.map((g) => g.ch).join('');
  assert.equal(chars, 'Hi Zed! Oh');
  assert.equal(t[3].color, 'gold');
  assert.equal(t[6].color, null);
  assert.equal(t[7].pause, 0.5);
  assert.equal(t[8].fx, 'shake');
});

test('layout wraps at word boundaries and never exceeds the width', () => {
  const pages = layout('The Gate stopped singing last night and nobody knows why. Not even Juniper.', 100);
  const lines = pages.flat();
  assert.ok(lines.length > 1);
  for (const line of lines) {
    assert.ok(line.w <= 100, `line ${line.w}px`);
    const last = line.glyphs.at(-1);
    assert.ok(last.x + GLYPHS[last.ch].w <= 100);
  }
  assert.equal(lines.map(lineText).join(' '),
    'The Gate stopped singing last night and nobody knows why. Not even Juniper.');
});

test('layout paginates every 3 lines and honours line breaks', () => {
  const pages = layout('one\ntwo\nthree\nfour', 200);
  assert.equal(pages.length, 2);
  assert.equal(pages[0].length, 3);
  assert.equal(pages[1][0].glyphs.map((g) => g.ch).join(''), 'four');
});

test('a pause before a space carries to the next letter', () => {
  const pages = layout('Wait...{p:0.6} what?', 200);
  const glyphs = pages[0][0].glyphs;
  const w = glyphs.find((g) => g.ch === 'w');
  assert.equal(w.pause, 0.6);
});
