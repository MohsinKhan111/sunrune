// The dialogue box (F8): typewriter text with voice blips, name tag, portrait, choices.
// Pushed onto the scene stack; the world keeps animating underneath.
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { C, colour } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { glyph, text, textWidth } from '../engine/font.js';
import { layout, advance } from '../engine/glyphs.js';
import { charSheet } from '../engine/sheets.js';
import { ease, clamp } from '../engine/ease.js';
import { rng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { CHARS } from '../data/chars.js';

export const TEXT_SPEEDS = { slow: 30, normal: 55, fast: 110, instant: Infinity };
export const BOX = { x: 8, y: 122, w: 304, h: 54 };
export const TEXT_W = { portrait: 240, plain: 288 };

export function say(speaker, str, opts = {}) {
  return new Promise((resolve) => G.push(new DialogScene(speaker, str, { ...opts, resolve })));
}

export function ask(speaker, str, choices, opts = {}) {
  return new Promise((resolve) => G.push(new DialogScene(speaker, str, { ...opts, choices, resolve })));
}

export class DialogScene {
  constructor(speaker, str, { choices = null, resolve, portrait, name } = {}) {
    this.opaque = false;
    this.blocksUpdate = false;
    this.speaker = speaker && CHARS[speaker] ? speaker : null;
    this.name = name ?? (this.speaker ? CHARS[this.speaker].name : null);
    if (this.speaker === 'pip') this.name = G.state?.name ?? 'Pip';
    this.portrait = portrait ?? !!this.speaker;
    this.textX = this.portrait ? BOX.x + 62 : BOX.x + 10;
    const hero = G.state?.name ?? 'Pip';
    this.pages = layout(str, this.portrait ? TEXT_W.portrait : TEXT_W.plain, { maxLines: 3, hero }).map((lines) => {
      const flat = [];
      lines.forEach((line, li) => line.glyphs.forEach((g) => flat.push({ ...g, line: li })));
      return flat;
    });
    this.page = 0;
    this.shown = 0;
    this.budget = 0;
    this.choices = choices;
    this.choosing = false;
    this.cursor = 0;
    this.resolve = resolve;
    this.t = 0;
    this.openT = 0;
    this.pageT = 0;
    this.blipN = 0;
    this.shakeSeed = 0;
    this.voice = this.speaker ? CHARS[this.speaker].voice : 1;
  }

  get flat() {
    return this.pages[this.page];
  }

  update(dt, isTop) {
    this.t += dt;
    this.openT += dt;
    this.pageT += dt;
    if (Math.floor(this.t * 20) !== this.shakeSeed) this.shakeSeed = Math.floor(this.t * 20);
    if (!isTop) return;
    if (this.choosing) {
      const n = this.choices.length;
      if (input.repeat('down')) {
        this.cursor = (this.cursor + 1) % n;
        audio.sfx('cursor');
      }
      if (input.repeat('up')) {
        this.cursor = (this.cursor + n - 1) % n;
        audio.sfx('cursor');
      }
      if (input.pressed('confirm')) {
        audio.sfx('confirm');
        this.close(this.cursor);
      } else if (input.pressed('cancel')) {
        audio.sfx('cancel');
        this.close(n - 1);
      }
      return;
    }
    const flat = this.flat;
    if (this.shown < flat.length) {
      const speed = TEXT_SPEEDS[G.settings?.textSpeed ?? 'normal'] ?? 55;
      if (speed === Infinity || (input.pressed('confirm') && this.pageT > 0.12)) {
        this.shown = flat.length;
        return;
      }
      const mult = input.held('confirm') && this.pageT > 0.12 ? 4 : 1;
      this.budget += dt * mult;
      while (this.shown < flat.length) {
        const g = flat[this.shown];
        const cost = 1 / speed + (g.pause || 0) / mult;
        if (this.budget < cost) break;
        this.budget -= cost;
        this.shown++;
        if (this.blipN++ % 2 === 0) audio.blip(this.voice);
      }
      return;
    }
    if (input.pressed('confirm') && this.pageT > 0.12) {
      if (this.page + 1 < this.pages.length) {
        this.page++;
        this.shown = 0;
        this.budget = 0;
        this.pageT = 0;
        audio.sfx('text');
      } else if (this.choices) {
        this.choosing = true;
        this.cursor = 0;
      } else {
        this.close(0);
      }
    }
  }

  close(value) {
    G.pop(this);
    this.resolve?.(value);
  }

  render() {
    const k = ease.outCubic(clamp(this.openT / 0.12, 0, 1));
    const y = BOX.y + Math.round((1 - k) * 8);
    R.alpha(k, () => {
      R.box(BOX.x, y, BOX.w, BOX.h, C.ink);
      if (this.name) {
        const w = textWidth(this.name) + 11;
        R.tag(BOX.x + 6, y - 11, w, 13, C.red);
        text(this.name, BOX.x + 11, y - 9);
      }
      if (this.portrait) {
        R.rect(BOX.x + 5, y + 4, 51, BOX.h - 8, C.plum);
        const typing = this.shown < this.flat.length;
        const frame = typing && Math.floor(this.t * 7) % 2 ? 1 : 0;
        R.sprite(charSheet[this.speaker], frame, BOX.x + 6, y + 2, { scale: 2 });
      }
      const flat = this.flat;
      const r = (i) => ((Math.sin((this.shakeSeed + i) * 12.9898) * 43758.5453) % 1 + 1) % 1;
      for (let i = 0; i < this.shown; i++) {
        const g = flat[i];
        let dx = 0;
        let dy = 0;
        if (g.fx === 'shake') {
          dx = r(i) < 0.33 ? -1 : r(i) > 0.66 ? 1 : 0;
          dy = r(i + 7) < 0.3 ? -1 : 0;
        } else if (g.fx === 'wave') {
          dy = Math.round(Math.sin(this.t * 7 + i * 0.7) * 1.4);
        }
        glyph(g.ch, this.textX + g.x + dx, y + 10 + g.line * 12 + dy, g.color ? colour(g.color) : C.white);
      }
      if (this.shown >= flat.length && !this.choosing) {
        text('▼', BOX.x + BOX.w - 13, y + BOX.h - 13 + Math.round(Math.sin(this.t * 6)), { color: 'gold', shadow: false });
      }
      if (this.choosing) this.renderChoices(y);
    });
  }

  renderChoices(boxY) {
    const n = this.choices.length;
    const w = Math.max(...this.choices.map((c) => textWidth(c))) + 30;
    const h = n * 14 + 8;
    const x = BOX.x + BOX.w - w;
    const y = boxY - h - 3;
    R.box(x, y, w, h, C.ink);
    this.choices.forEach((c, i) => {
      const sel = i === this.cursor;
      text(c, x + 22, y + 6 + i * 14, { color: sel ? 'gold' : 'white' });
      if (sel) text('→', x + 8 + Math.round(Math.sin(this.t * 8) * 0.8), y + 6 + i * 14, { color: 'gold' });
    });
  }
}

// Test helper: the text of the dialogue on screen, or null. Spaces are put back from
// the gaps between glyphs, since the layout only keeps the glyphs it draws.
export function currentDialogue() {
  const top = G.stack.find((s) => s instanceof DialogScene);
  if (!top) return null;
  let out = '';
  let prev = null;
  for (const g of top.flat) {
    if (prev && (g.line !== prev.line || g.x > prev.x + advance(prev.ch))) out += ' ';
    out += g.ch;
    prev = g;
  }
  return out;
}

export { rng as dialogueRng };
