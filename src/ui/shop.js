// Tilly's counter (F15): four things to buy, no selling. Every price comes from
// src/data/items.js, which follows DATA.md - none of them are typed in here.
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text } from '../engine/font.js';
import { ease, clamp } from '../engine/ease.js';
import { audio } from '../engine/audio.js';
import { ITEMS, SHOP, MAX_STACK } from '../data/items.js';
import { itemCount, addItem, addDollars } from '../story/state.js';

const LIST = { x: 8, y: 26, w: 150, h: 104 };
const INFO = { x: 162, y: 26, w: 150, h: 104 };

class ShopScene {
  constructor(resolve) {
    this.opaque = false;
    this.blocksUpdate = true;
    this.resolve = resolve;
    this.cursor = 0;
    this.qty = null; // null while browsing, 1-9 while picking an amount
    this.msg = '';
    this.msgT = 0;
    this.t = 0;
  }

  get id() {
    return SHOP[this.cursor];
  }

  get item() {
    return ITEMS[this.id];
  }

  note(str) {
    this.msg = str;
    this.msgT = 2.6;
  }

  buy() {
    const st = G.state;
    const id = this.id;
    const n = this.qty;
    const cost = this.item.price * n;
    if (cost > st.dollars) {
      audio.sfx('error');
      this.note("You don't have enough sand dollars.");
      return;
    }
    // addItem refuses to go over the stack limit, so ask it rather than duplicating
    // the rule here.
    if (!addItem(st, id, n)) {
      audio.sfx('error');
      this.note(`Your satchel's too full for another ${this.item.name}.`);
      return;
    }
    addDollars(st, -cost);
    audio.sfx('coin');
    this.note(`Bought ${n > 1 ? `${n} ` : 'a '}${this.item.name}.`);
    this.qty = null;
  }

  leave() {
    audio.sfx('cancel');
    G.pop(this);
    this.resolve();
  }

  update(dt, isTop) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (!isTop) return;

    if (this.qty === null) {
      if (input.repeat('down')) {
        this.cursor = (this.cursor + 1) % SHOP.length;
        audio.sfx('cursor');
      }
      if (input.repeat('up')) {
        this.cursor = (this.cursor + SHOP.length - 1) % SHOP.length;
        audio.sfx('cursor');
      }
      if (input.pressed('confirm')) {
        audio.sfx('confirm');
        this.qty = 1;
      }
      if (input.pressed('cancel') || input.pressed('menu')) this.leave();
      return;
    }

    // Picking an amount.
    if (input.repeat('right') || input.repeat('up')) {
      this.qty = Math.min(MAX_STACK, this.qty + 1);
      audio.sfx('cursor');
    }
    if (input.repeat('left') || input.repeat('down')) {
      this.qty = Math.max(1, this.qty - 1);
      audio.sfx('cursor');
    }
    if (input.pressed('confirm')) this.buy();
    if (input.pressed('cancel') || input.pressed('menu')) {
      audio.sfx('cancel');
      this.qty = null;
    }
  }

  render() {
    const st = G.state;
    R.fill('#000000', 0.55);
    const slide = 1 - ease.outCubic(clamp(this.t / 0.25, 0, 1));

    text("TILLY'S COUNTER", VW / 2, 10 - slide * 6, { align: 'center', color: 'gold' });

    // Left: what's for sale, and what it costs.
    R.box(LIST.x, LIST.y, LIST.w, LIST.h, C.ink);
    SHOP.forEach((id, i) => {
      const it = ITEMS[id];
      const sel = i === this.cursor;
      const y = LIST.y + 10 + i * 16;
      const afford = it.price <= st.dollars;
      if (sel) text('→', LIST.x + 6, y, { color: 'gold' });
      text(it.name, LIST.x + 18, y, { color: sel ? 'gold' : afford ? 'white' : 'mist' });
      text(String(it.price), LIST.x + LIST.w - 10, y, {
        align: 'right',
        color: afford ? 'cream' : 'mist',
      });
    });

    // Right: what it does, how many you have.
    R.box(INFO.x, INFO.y, INFO.w, INFO.h, C.ink);
    const it = this.item;
    const words = wrap(it.desc, 21);
    words.forEach((line, i) => {
      text(line, INFO.x + 8, INFO.y + 8 + i * 11, { color: 'white' });
    });
    text(`You have ${itemCount(st, this.id)} of ${MAX_STACK}`, INFO.x + 8, INFO.y + INFO.h - 20, {
      color: 'mist',
    });

    // The amount picker sits over the counter, so the numbers are where the eye is.
    if (this.qty !== null) {
      // Sits over the description panel rather than across the middle, so the price
      // list stays readable while you pick an amount.
      const w = INFO.w - 16;
      const h = 46;
      const x = INFO.x + 8;
      const y = 62;
      R.box(x, y, w, h, C.navy);
      text('How many?', x + 10, y + 8, { color: 'gold' });
      text(`← ${this.qty} →`, x + w / 2, y + 22, { align: 'center', color: 'white' });
      const cost = it.price * this.qty;
      text(`${cost}`, x + w - 10, y + 32, {
        align: 'right',
        color: cost > st.dollars ? 'red' : 'cream',
      });
      text('costs', x + 10, y + 32, { color: 'mist' });
    }

    // Bottom strip: money, and the way out.
    text(`Sand dollars: ${st.dollars}`, 8, VH - 16, { color: 'gold' });
    text(this.qty === null ? 'Enter: buy   Esc: leave' : 'Enter: take it   Esc: back', VW - 8, VH - 16, {
      align: 'right',
      color: 'mist',
    });
    if (this.msgT > 0) {
      text(this.msg, VW / 2, VH - 30, { align: 'center', color: 'cream' });
    }
  }
}

// The description panel is narrow, so break on words rather than clipping.
function wrap(str, cols) {
  const out = [];
  let line = '';
  for (const word of str.split(' ')) {
    if (line && (line + ' ' + word).length > cols) {
      out.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) out.push(line);
  return out;
}

export function openShop() {
  return new Promise((resolve) => G.push(new ShopScene(resolve)));
}
