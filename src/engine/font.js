// Drawing text. The small font comes from glyphs.js; the big font is the pack's chunky
// capitals in ui.png. Never ctx.fillText (RULES).
import { GLYPHS, GLYPH_H, advance, parseRich, textWidth } from './glyphs.js';
import { R, makeCanvas, recolor } from './gfx.js';
import { C, colour } from './palette.js';

let atlas = null;
const atlasX = {};
const tinted = new Map();

let uiImage = null;
const bigGlyphs = { 1: {}, 2: {} };
const bigTinted = new Map();
const BIG_SPACE = 6;

const BIG_MAPS = {
  1: { '%': 90, '+': 91, '-': 92, digits: 93, am: 108, nz: 126 },
  2: { '%': 144, '+': 145, '-': 146, digits: 147, am: 162, nz: 180 },
};

export function initFont(ui) {
  let width = 0;
  for (const g of Object.values(GLYPHS)) width += g.w + 1;
  atlas = makeCanvas(width, GLYPH_H);
  const a = atlas.getContext('2d');
  a.fillStyle = '#ffffff';
  let x = 0;
  for (const [ch, g] of Object.entries(GLYPHS)) {
    atlasX[ch] = x;
    g.rows.forEach((row, y) => {
      for (let i = 0; i < row.length; i++) if (row[i] === '#') a.fillRect(x + i, y, 1, 1);
    });
    x += g.w + 1;
  }

  uiImage = ui;
  const scan = makeCanvas(ui.width, ui.height);
  const sx = scan.getContext('2d');
  sx.drawImage(ui, 0, 0);
  const px = sx.getImageData(0, 0, ui.width, ui.height).data;
  for (const style of [1, 2]) {
    const m = BIG_MAPS[style];
    const chars = { '%': m['%'], '+': m['+'], '-': m['-'] };
    for (let d = 0; d < 10; d++) chars[String(d)] = m.digits + d;
    for (let i = 0; i < 13; i++) chars[String.fromCharCode(65 + i)] = m.am + i;
    for (let i = 0; i < 13; i++) chars[String.fromCharCode(78 + i)] = m.nz + i;
    for (const [ch, tile] of Object.entries(chars)) {
      const tx = (tile % 18) * 16;
      const ty = Math.floor(tile / 18) * 16;
      let x0 = 16, x1 = -1, y0 = 16, y1 = -1;
      for (let y = 0; y < 16; y++) {
        for (let xx = 0; xx < 16; xx++) {
          if (px[((ty + y) * ui.width + tx + xx) * 4 + 3] > 0) {
            if (xx < x0) x0 = xx;
            if (xx > x1) x1 = xx;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
        }
      }
      bigGlyphs[style][ch] = { sx: tx + x0, sy: ty, w: x1 - x0 + 1, top: y0, bottom: y1 };
    }
  }
}

function tintedAtlas(color) {
  let c = tinted.get(color);
  if (!c) {
    c = makeCanvas(atlas.width, atlas.height);
    const x = c.getContext('2d');
    x.drawImage(atlas, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = color;
    x.fillRect(0, 0, c.width, c.height);
    tinted.set(color, c);
  }
  return c;
}

// One small-font glyph, top-left at (x, y).
export function glyph(ch, x, y, color = C.white, o) {
  if (ch === ' ' || !(ch in atlasX)) return;
  R.img(tintedAtlas(color), atlasX[ch], 0, GLYPHS[ch].w, GLYPH_H, x, y, o);
}

// Small-font text. o: { color, shadow (colour or false), align: left|center|right, alpha }
// Supports {c:name} colour tags; other tags are ignored here.
export function text(str, x, y, o = {}) {
  str = String(str);
  const base = colour(o.color ?? 'white');
  const shadow = o.shadow === false ? null : colour(o.shadow ?? 'ink');
  const w = textWidth(str);
  let left = Math.round(x);
  if (o.align === 'center') left = Math.round(x - w / 2);
  else if (o.align === 'right') left = Math.round(x - w);
  const tokens = parseRich(str);
  const alpha = o.alpha === undefined ? undefined : { alpha: o.alpha };
  for (const pass of shadow ? [0, 1] : [1]) {
    let cx = left;
    let cy = Math.round(y);
    for (const t of tokens) {
      if (t.ch === '\n') {
        cx = left;
        cy += 11;
        continue;
      }
      if (pass === 0) glyph(t.ch, cx + 1, cy + 1, shadow, alpha);
      else glyph(t.ch, cx, cy, t.color ? colour(t.color) : base, alpha);
      cx += advance(t.ch);
    }
  }
  return w;
}

export { textWidth };

function bigSheet(color) {
  if (!color || color === C.white) return uiImage;
  let c = bigTinted.get(color);
  if (!c) {
    const shade = colour(color);
    c = recolor(uiImage, (hex) => (hex === '#ffffff' || hex === '#fcfcfc' ? shade : null));
    bigTinted.set(color, c);
  }
  return c;
}

// Characters the pack's font doesn't have (apostrophes, punctuation) fall back to the
// small font at the same pixel scale.
export function bigWidth(str, style = 1) {
  let w = 0;
  for (const ch of String(str).toUpperCase()) {
    const g = bigGlyphs[style][ch];
    if (g) w += g.w + 1;
    else if (ch === ' ') w += BIG_SPACE;
    else w += (GLYPHS[ch]?.w ?? 3) + 1;
  }
  return Math.max(0, w - 1);
}

// Big pack-font text (capitals, digits, + - %). o: { style: 1|2, color, align, scale, alpha }
export function bigText(str, x, y, o = {}) {
  const style = o.style ?? 1;
  const k = o.scale ?? 1;
  const sheet = bigSheet(o.color ? colour(o.color) : null);
  const w = bigWidth(str, style) * k;
  let cx = x;
  if (o.align === 'center') cx = x - w / 2;
  else if (o.align === 'right') cx = x - w;
  cx = Math.round(cx);
  for (const ch of String(str).toUpperCase()) {
    const g = bigGlyphs[style][ch];
    if (!g) {
      if (ch === ' ' || !GLYPHS[ch]) {
        cx += BIG_SPACE * k;
      } else {
        glyph(ch, cx, y + 2 * k, o.color ? colour(o.color) : C.white, { scale: k, alpha: o.alpha });
        cx += (GLYPHS[ch].w + 1) * k;
      }
      continue;
    }
    R.img(sheet, g.sx, g.sy, g.w, 16, cx, y, { scale: k, alpha: o.alpha });
    cx += (g.w + 1) * k;
  }
  return w;
}
