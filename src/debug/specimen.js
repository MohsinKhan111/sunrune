// ?debug=specimen - fonts, panels, recoloured cast and custom props on one screen.
import { R } from '../engine/gfx.js';
import { C } from '../engine/palette.js';
import { GLYPHS } from '../engine/glyphs.js';
import { text, bigText } from '../engine/font.js';
import { charSheet, charBlink, enemySheet, art } from '../engine/sheets.js';
import { CHARS } from '../data/chars.js';

export class SpecimenScene {
  constructor() {
    this.opaque = true;
  }

  update() {}

  render() {
    R.fill(C.plum);
    R.box(4, 4, 312, 42);
    const chars = Object.keys(GLYPHS).join('');
    const per = 52;
    for (let i = 0; i < chars.length; i += per) text(chars.slice(i, i + per), 10, 8 + (i / per) * 11);
    bigText('SUNRUNE 0123', 6, 48);
    bigText('SUNRUNE', 120, 48, { color: 'gold' });
    R.box(200, 48, 50, 18, C.ink);
    R.tag(254, 50, 30, 12, C.red);
    text('Tilly', 258, 52);

    let x = 4;
    for (const id of Object.keys(CHARS)) {
      R.sprite(charSheet[id], 0, x, 68);
      text(id.slice(0, 5), x + 12, 93, { align: 'center', color: 'mist' });
      x += 24;
    }
    R.sprite(charBlink.pip, 0, 4, 104);
    R.sprite(charBlink.biscuit, 0, 28, 104);
    R.sprite(charSheet.pip, 2, 52, 104);
    for (let f = 0; f < 4; f++) R.sprite(enemySheet[f], 0, 80 + f * 24, 104);

    const names = ['bed', 'table', 'rug', 'satchel', 'tumbleweed', 'envelope', 'padlock', 'sunrune', 'shard',
      'glyphRise', 'glyphSun', 'glyphMoon', 'butterfly0', 'butterfly1Salmon', 'butterfly0Mint', 'coin'];
    x = 4;
    let y = 132;
    for (const n of names) {
      const a = art[n];
      if (x + a.width > 316) {
        x = 4;
        y += 26;
      }
      R.pic(a, x, y);
      x += a.width + 6;
    }
  }
}
