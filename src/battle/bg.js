// Battle backgrounds (F12): two layers of patterns, each row pushed sideways by a sine
// wave, with the palette slowly cycling. Calmer when "reduce flashing" is on.
import { R, makeCanvas } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { G } from '../game.js';

const PRESETS = {
  teal: { colors: [C.sea, C.teal, C.mint, C.blue], back: 'stripes', front: 'diamonds' },
  amber: { colors: [C.amber, C.gold, C.butter, C.salmon], back: 'rings', front: 'stripes' },
  ember: { colors: [C.brick, C.red, C.salmon, C.gold], back: 'checks', front: 'rings' },
  boss: { colors: [C.violet, C.purple, C.lilac, C.navy], back: 'rings', front: 'checks' },
  dark: { colors: [C.plum, C.dusk, C.steel, C.navy], back: 'stripes', front: 'checks' },
};

const SIZE = 64;

function pattern(kind, colors, shift) {
  const c = makeCanvas(SIZE, SIZE);
  const x = c.getContext('2d');
  const col = (i) => colors[(i + shift) % colors.length];
  for (let py = 0; py < SIZE; py++) {
    for (let px = 0; px < SIZE; px++) {
      let i;
      if (kind === 'stripes') i = Math.floor((px + py) / 8) % colors.length;
      else if (kind === 'checks') i = (Math.floor(px / 8) + Math.floor(py / 8)) % colors.length;
      else if (kind === 'diamonds') i = Math.floor((Math.abs(px - 32) + Math.abs(py - 32)) / 7) % colors.length;
      else i = Math.floor(Math.hypot(px - 32, py - 32) / 7) % colors.length;
      x.fillStyle = col(i);
      x.fillRect(px, py, 1, 1);
    }
  }
  return c;
}

export class Background {
  constructor(preset = 'teal') {
    const p = PRESETS[preset] ?? PRESETS.teal;
    this.back = [0, 1, 2, 3].map((s) => pattern(p.back, p.colors, s));
    this.front = [0, 1, 2, 3].map((s) => pattern(p.front, p.colors, s));
    this.t = 0;
  }

  update(dt) {
    this.t += dt * (G.settings?.reduceFlashing ? 0.25 : 1);
  }

  // Draws a layer as horizontal bands, each offset by a sine wave. Bands whose source
  // wraps past the bottom of the pattern are drawn in two pieces, so there are no seams.
  layer(sheets, speed, amp, band, alpha, cycle) {
    const t = this.t * speed;
    const wrap = (v) => ((v % SIZE) + SIZE) % SIZE;
    for (let y = 0; y < VH; y += band) {
      const h = Math.min(band, VH - y);
      const sheet = sheets[cycle ? wrap(Math.floor(t + y * 0.04)) % sheets.length : 0];
      const sy = wrap(y + Math.floor(t * 6));
      const off = wrap(Math.round(Math.sin(y * 0.06 + t * 2) * amp + t * 12));
      const top = Math.min(h, SIZE - sy);
      for (let x = -off; x < VW; x += SIZE) {
        R.img(sheet, 0, sy, SIZE, top, x, y, { alpha });
        if (top < h) R.img(sheet, 0, 0, SIZE, h - top, x, y + top, { alpha });
      }
    }
  }

  render() {
    const calm = G.settings?.reduceFlashing;
    this.layer(this.back, 1, 6, 3, 1, !calm);
    this.layer(this.front, -1.4, 9, 4, 0.28, !calm);
  }
}
