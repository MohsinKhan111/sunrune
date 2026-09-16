// The game's own words: do they fit the box, can the font draw them, do they say the
// right sort of thing, and does every id they mention exist (F8, F10).
// Strings are read out of the source rather than imported, so this stays a pure test -
// chapter1.js pulls in the renderer and the audio engine, which have no place here.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { layout, hasGlyph, parseRich } from '../../src/engine/glyphs.js';
import { CHARS } from '../../src/data/chars.js';
import { ITEMS, KEY_ITEMS } from '../../src/data/items.js';
import { ENEMIES } from '../../src/data/enemies.js';
import { SKILLS, MEMBERS } from '../../src/data/party.js';

const SRC = path.join(process.cwd(), 'src');
const read = (p) => fs.readFileSync(path.join(SRC, p), 'utf8');

// The dialogue box's two widths, taken from the code so the test can't drift from it.
const boxWidths = (() => {
  const src = read('story/dialogue.js');
  const m = /TEXT_W = \{ portrait: (\d+), plain: (\d+) \}/.exec(src);
  assert.ok(m, 'could not find TEXT_W in dialogue.js');
  return { portrait: Number(m[1]), plain: Number(m[2]) };
})();

// Every string literal in a file: single, double and template quoted.
function literals(src) {
  const out = [];
  const patterns = [/'((?:[^'\\\n]|\\.)*)'/g, /"((?:[^"\\\n]|\\.)*)"/g, /`((?:[^`\\]|\\.)*)`/g];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(src))) {
      out.push(
        m[1]
          .replace(/\\'/g, "'")
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\')
          .replace(/\$\{[^}]*\}/g, 'Pip'), // a stand-in for whatever is interpolated
      );
    }
  }
  return out;
}

// Prose, as opposed to an id, a path or a colour. Anything a player reads has a space
// in it; ids like rune_compass and paths like ../engine/gfx.js do not.
function isProse(s) {
  if (!/\s/.test(s)) return false;
  if (!/[a-zA-Z]/.test(s)) return false;
  if (s.includes('/') && !s.includes(' /')) return false;
  return true;
}

const FILES = {
  dialogue: ['story/chapter1.js'],
  panels: [
    'ui/menu.js', 'ui/settings.js', 'ui/shop.js', 'ui/ending.js', 'ui/title.js',
    'data/items.js', 'data/party.js', 'engine/save.js',
  ],
};

const dialogueText = FILES.dialogue.map(read).join('\n');
const dialogueStrings = literals(dialogueText).filter(isProse);
const panelStrings = FILES.panels.flatMap((f) => literals(read(f))).filter(isProse);
const allStrings = [...dialogueStrings, ...panelStrings];

test('there is dialogue to check in the first place', () => {
  assert.ok(dialogueStrings.length > 80, `only found ${dialogueStrings.length} lines of dialogue`);
});

test('every line of dialogue fits the box, with a portrait and without', () => {
  for (const str of dialogueStrings) {
    for (const [kind, width] of Object.entries(boxWidths)) {
      for (const page of layout(str, width, { hero: 'Pip' })) {
        for (const line of page) {
          assert.ok(line.w <= width, `${kind} box (${width}px) overflows at ${line.w}px: "${str}"`);
        }
      }
    }
  }
});

test('no line of dialogue is drawn against the edge of its box', () => {
  // The frame is 2 px, so the inside of the box ends at x 310. Both layouts start their
  // text 8 px in from the inside edge; this is the same promise on the other side.
  const src = read('story/dialogue.js');
  const box = /BOX = \{ x: (\d+), y: \d+, w: (\d+), h: \d+ \}/.exec(src);
  assert.ok(box, 'could not find BOX in dialogue.js');
  const innerRight = Number(box[1]) + Number(box[2]) - 2;
  // Where each layout puts its first glyph, taken from the code for the same reason.
  const starts = { portrait: Number(box[1]) + 62, plain: Number(box[1]) + 10 };
  const MARGIN = 8;
  for (const [kind, width] of Object.entries(boxWidths)) {
    assert.ok(
      starts[kind] + width <= innerRight - MARGIN + 1,
      `${kind} text can reach x${starts[kind] + width}, ${innerRight - starts[kind] - width}px from the border at x${innerRight}`,
    );
    for (const str of dialogueStrings) {
      for (const page of layout(str, width, { hero: 'Pip' })) {
        for (const line of page) {
          const end = starts[kind] + line.w;
          assert.ok(end <= innerRight - MARGIN, `${kind}: a line ends at x${end}, ${innerRight - end}px from the border: "${str}"`);
        }
      }
    }
  }
});

test('a page of dialogue is never more than three lines', () => {
  for (const str of dialogueStrings) {
    for (const page of layout(str, boxWidths.portrait, { hero: 'Pip' })) {
      assert.ok(page.length <= 3, `${page.length} lines on one page: "${str}"`);
    }
  }
});

test('the font can draw every character the game shows', () => {
  const missing = new Map();
  for (const str of allStrings) {
    for (const g of parseRich(str, { hero: 'Pip' })) {
      if (!hasGlyph(g.ch)) missing.set(g.ch, str);
    }
  }
  assert.equal(
    missing.size, 0,
    [...missing].map(([ch, where]) => `"${ch}" (U+${ch.codePointAt(0).toString(16)}) in "${where}"`).join('; '),
  );
});

test('nothing in the game says dead, killed, died, kill or blood', () => {
  const banned = /\b(dead|killed|died|kill|blood)\b/i;
  for (const str of allStrings) {
    const hit = banned.exec(str);
    assert.ok(!hit, `"${hit?.[0]}" appears in: "${str}"`);
  }
});

test('every character who speaks exists', () => {
  const speakers = new Set();
  for (const m of dialogueText.matchAll(/\bg\.say\(\s*'([a-z_]+)'/g)) speakers.add(m[1]);
  for (const m of dialogueText.matchAll(/\bname: '([A-Z][^']*)'/g)) speakers.add(m[1]);
  for (const id of speakers) {
    if (/^[A-Z]/.test(id)) continue; // a one-off name like ??? or Grumblejaw, not a cast id
    assert.ok(CHARS[id], `nobody in the cast is called "${id}"`);
  }
});

test('every item, key item, enemy and skill the story names exists', () => {
  const check = (re, table, what) => {
    for (const m of dialogueText.matchAll(re)) {
      assert.ok(table[m[1]], `${what} "${m[1]}" is used in the story but not defined`);
    }
  };
  check(/\baddItem\(G\.state, '([a-z_]+)'/g, ITEMS, 'item');
  check(/\bITEMS\[\s*'([a-z_]+)'\s*\]/g, ITEMS, 'item');
  check(/\bgiveKey\(\s*\w+, '([a-z_]+)'/g, KEY_ITEMS, 'key item');
  check(/\btakeKey\(\s*\w+, '([a-z_]+)'/g, KEY_ITEMS, 'key item');
  check(/\bhasKey\(\s*\w+, '([a-z_]+)'/g, KEY_ITEMS, 'key item');
  check(/kind: '([a-z_]+)', x: \d+, y: \d+, radius/g, ENEMIES, 'enemy');
});

test('the party and their skills line up with the data', () => {
  for (const [id, m] of Object.entries(MEMBERS)) {
    assert.ok(m.name, `${id} has no name`);
    for (const [skill] of m.skills) assert.ok(SKILLS[skill], `${id} learns unknown skill "${skill}"`);
  }
});

test('every story flag that is checked is also set somewhere', () => {
  const files = ['story/chapter1.js', 'world/overworld.js', 'story/state.js'];
  const src = files.map(read).join('\n');
  const set = new Set();
  for (const m of src.matchAll(/setFlag\(\s*\w+(?:\.\w+)?,\s*'([a-z_:]+)'/g)) set.add(m[1]);
  // newGame starts with none, and the intro flag is cleared rather than set again.
  for (const m of src.matchAll(/\bflag\(\s*\w+(?:\.\w+)?,\s*'([a-z_:]+)'/g)) {
    assert.ok(set.has(m[1]), `flag "${m[1]}" is checked but never set`);
  }
});
