// Sheets made at boot from the pack's art: the white halo dropped (D23), recoloured
// townsfolk (D3), blinking copies, white copies for hit flashes, enemy rows, and the
// custom props.
import { sheets, recolor, solid, makeCanvas, dropHalo } from './gfx.js';
import { CHARS } from '../data/chars.js';
import { buildArt } from '../art/props.js';
import { C } from './palette.js';

export const charSheet = {};
export const charBlink = {};
export const charWhite = {};
export const enemySheet = [];
export const enemyWhite = [];
export const art = {};

// Eye pixels per sprite row (cat, hamster, mouse, rabbit): x of both eyes, y for frames 0-2.
const EYES = {
  0: { x: [11, 14], y: [15, 14, 12] },
  1: { x: [11, 15], y: [14, 13, 11] },
  2: { x: [11, 14], y: [15, 14, 12] },
  3: { x: [11, 15], y: [15, 14, 12] },
};

// Paints each eye pixel; colorAt(data, i) returns [r, g, b] for the pixel index.
function paintEyes(canvas, row, colorAt) {
  const x = canvas.getContext('2d');
  const img = x.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const e = EYES[row];
  for (let f = 0; f < 3; f++) {
    for (const ex of e.x) {
      const i = (e.y[f] * canvas.width + f * 24 + ex) * 4;
      const [r, g, b] = colorAt(d, i);
      d[i] = r;
      d[i + 1] = g;
      d[i + 2] = b;
    }
  }
  x.putImageData(img, 0, 0);
}

const hex = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function buildSheets() {
  const chars = dropHalo(sheets.chars, 24, 24);
  const enemies = dropHalo(sheets.enemies, 24, 24);
  for (const [id, def] of Object.entries(CHARS)) {
    const sheet = recolor(chars, def.colors, 0, def.row * 24, 96, 24);
    if (id === 'stranger') paintEyes(sheet, def.row, () => hex(C.gold));
    charSheet[id] = sheet;
    const blink = makeCanvas(96, 24);
    blink.getContext('2d').drawImage(sheet, 0, 0);
    if (id !== 'stranger') paintEyes(blink, def.row, (d, i) => [d[i - 4], d[i - 3], d[i - 2]]);
    charBlink[id] = blink;
    charWhite[id] = solid(sheet, '#ffffff');
  }
  for (let r = 0; r < 4; r++) {
    const c = makeCanvas(96, 24);
    c.getContext('2d').drawImage(enemies, 0, r * 24, 96, 24, 0, 0, 96, 24);
    enemySheet[r] = c;
    enemyWhite[r] = solid(c, '#ffffff');
  }
  Object.assign(art, buildArt(makeCanvas));
}
