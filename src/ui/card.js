// Full-screen cards: the chapter title, and lines of narration on black (F4, F20).
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { input } from '../engine/input.js';
import { text, bigText } from '../engine/font.js';
import { ease, clamp } from '../engine/ease.js';

class CardScene {
  constructor({ title, subtitle, lines, dur, resolve }) {
    this.opaque = true;
    this.blocksUpdate = true;
    this.title = title ?? null;
    this.subtitle = subtitle ?? null;
    this.lines = lines ?? null;
    this.dur = dur ?? 2.6;
    this.resolve = resolve;
    this.t = 0;
    this.index = 0;
  }

  update(dt, isTop) {
    this.t += dt;
    const skip = isTop && this.t > 0.25 && input.pressed('confirm');
    if (this.t < this.dur && !skip) return;
    if (this.lines && this.index < this.lines.length - 1) {
      this.index++;
      this.t = 0;
      return;
    }
    G.pop(this);
    this.resolve?.();
  }

  render() {
    R.fill('#000000');
    const fade = Math.min(1, this.t / 0.4) * clamp((this.dur + 0.4 - this.t) / 0.4, 0, 1);
    if (this.lines) {
      const line = this.lines[this.index];
      text(line, VW / 2, VH / 2 - 5, { align: 'center', alpha: fade, color: 'cream' });
      return;
    }
    const y = 62 + Math.round((1 - ease.outCubic(Math.min(1, this.t / 0.5))) * 6);
    if (this.title) bigText(this.title, VW / 2, y, { align: 'center', color: 'gold', scale: 2, alpha: fade });
    if (this.subtitle) text(this.subtitle, VW / 2, y + 40, { align: 'center', alpha: fade });
  }
}

export function card(title, subtitle, dur = 2.8) {
  return new Promise((resolve) => G.push(new CardScene({ title, subtitle, dur, resolve })));
}

export function narrate(lines, dur = 2.6) {
  return new Promise((resolve) => G.push(new CardScene({ lines, dur, resolve })));
}
