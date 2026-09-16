// Settings (F3). Every change applies the moment it is made and is written straight
// away - there is no "apply" button to forget. Fullscreen is the exception that isn't
// stored: it is read back from the browser, so the row always shows the real state.
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { screen, VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text } from '../engine/font.js';
import { audio } from '../engine/audio.js';
import { saveSettings } from '../engine/settings.js';
import { hasSave, eraseSave } from '../engine/save.js';
import { ease, clamp } from '../engine/ease.js';
import { touch } from './touch.js';

const ALL_ROWS = [
  { id: 'music', label: 'Music volume', kind: 'volume' },
  { id: 'sfx', label: 'Sound volume', kind: 'volume' },
  {
    id: 'textSpeed',
    label: 'Text speed',
    kind: 'choice',
    values: ['slow', 'normal', 'fast', 'instant'],
    labels: ['Slow', 'Normal', 'Fast', 'Instant'],
  },
  { id: 'shake', label: 'Screen shake', kind: 'toggle' },
  { id: 'reduceFlashing', label: 'Reduce flashing', kind: 'toggle' },
  {
    id: 'timing',
    label: 'Battle timing',
    kind: 'choice',
    values: ['normal', 'relaxed'],
    labels: ['Normal', 'Relaxed'],
  },
  { id: 'fullscreen', label: 'Fullscreen', kind: 'screen' },
  {
    id: 'touchControls',
    label: 'Touch controls',
    kind: 'choice',
    // Auto or always - never off. On a phone the pad is the only way to press anything,
    // including the way back into this menu to undo it. It hides itself the moment a
    // keyboard or a gamepad turns up instead (F40).
    values: ['auto', 'on'],
    labels: ['Auto', 'Always'],
    // No reason to offer a pad to a machine with no touchscreen - unless the player has
    // already turned one on, in which case they need the row to put it back to Auto.
    when: () => touch.coarse || G.settings.touchControls === 'on',
  },
  { id: 'vibrate', label: 'Button buzz', kind: 'toggle', when: () => touch.on },
  { id: 'erase', label: 'Erase save data', kind: 'action' },
  { id: 'back', label: 'Back', kind: 'action' },
];

const PANEL = { x: 40, y: 16, w: 240, h: 148 };
// What fits between the title and the panel's bottom edge. More rows than this and the
// list scrolls rather than spilling over the frame.
const VISIBLE = 9;

// The rows this device has any use for. Asked fresh each frame: turning the pad on adds
// the buzz row under the cursor, and it should appear the moment it applies.
function rows() {
  return ALL_ROWS.filter((r) => !r.when || r.when());
}

class SettingsScene {
  constructor(resolve) {
    this.opaque = false;
    this.blocksUpdate = true;
    this.resolve = resolve;
    this.cursor = 0;
    this.top = 0;
    this.confirming = false;
    this.confirmCursor = 1; // "No" first: erasing can't be undone
    this.msg = '';
    this.msgT = 0;
    this.t = 0;
  }

  note(str) {
    this.msg = str;
    this.msgT = 2.8;
  }

  value(row) {
    const s = G.settings;
    if (row.kind === 'volume') return `${s[row.id]}`;
    if (row.kind === 'toggle') return s[row.id] ? 'On' : 'Off';
    if (row.kind === 'choice') {
      const i = Math.max(0, row.values.indexOf(s[row.id]));
      return row.labels[i];
    }
    if (row.kind === 'screen') return screen.isFullscreen() ? 'On' : 'Off';
    return '';
  }

  // Anything that changes a setting comes through here, so nothing can be changed
  // without also being saved.
  apply(row) {
    saveSettings(G.settings);
    if (row.kind === 'volume') audio.setVolumes();
    // The pad answers the moment the row changes, rather than on the next reload.
    if (row.id === 'touchControls') touch.apply();
  }

  // Keeps the cursor inside the window of rows on screen.
  follow(list) {
    const last = Math.max(0, list.length - VISIBLE);
    this.top = Math.min(last, Math.max(0, this.top, this.cursor - VISIBLE + 1));
    this.top = Math.min(this.top, this.cursor);
  }

  change(row, dir) {
    const s = G.settings;
    if (row.kind === 'volume') {
      const next = Math.max(0, Math.min(100, (s[row.id] ?? 0) + dir * 10));
      if (next === s[row.id]) return;
      s[row.id] = next;
      this.apply(row);
      audio.sfx('cursor');
      return;
    }
    if (row.kind === 'toggle') {
      s[row.id] = !s[row.id];
      this.apply(row);
      audio.sfx('cursor');
      return;
    }
    if (row.kind === 'choice') {
      const n = row.values.length;
      const i = Math.max(0, row.values.indexOf(s[row.id]));
      s[row.id] = row.values[(i + dir + n) % n];
      this.apply(row);
      audio.sfx('cursor');
      return;
    }
    if (row.kind === 'screen') {
      screen.setFullscreen(!screen.isFullscreen());
      audio.sfx('confirm');
    }
  }

  eraseNow() {
    if (eraseSave()) {
      audio.sfx('lock');
      this.note('Your letter is gone.');
    } else {
      audio.sfx('error');
      this.note("Couldn't erase it - your browser is blocking saves.");
    }
  }

  close() {
    audio.sfx('cancel');
    G.pop(this);
    this.resolve?.();
  }

  update(dt, isTop) {
    this.t += dt;
    if (this.msgT > 0) this.msgT -= dt;
    if (!isTop) return;

    if (this.confirming) {
      if (input.repeat('up') || input.repeat('down') || input.repeat('left') || input.repeat('right')) {
        this.confirmCursor = this.confirmCursor === 0 ? 1 : 0;
        audio.sfx('cursor');
      }
      if (input.pressed('confirm')) {
        this.confirming = false;
        if (this.confirmCursor === 0) this.eraseNow();
        else audio.sfx('cancel');
      } else if (input.pressed('cancel') || input.pressed('menu')) {
        this.confirming = false;
        audio.sfx('cancel');
      }
      return;
    }

    const list = rows();
    // Turning the pad off takes the buzz row away under the cursor; keep it in range.
    this.cursor = Math.min(this.cursor, list.length - 1);
    if (input.repeat('down')) {
      this.cursor = (this.cursor + 1) % list.length;
      this.msgT = 0;
      audio.sfx('cursor');
    }
    if (input.repeat('up')) {
      this.cursor = (this.cursor + list.length - 1) % list.length;
      this.msgT = 0;
      audio.sfx('cursor');
    }
    this.follow(list);

    const row = list[this.cursor];
    if (input.repeat('right')) this.change(row, 1);
    if (input.repeat('left')) this.change(row, -1);

    if (input.pressed('confirm')) {
      if (row.id === 'back') this.close();
      else if (row.id === 'erase') {
        if (!hasSave()) {
          audio.sfx('error');
          this.note("There's no save to erase.");
        } else {
          audio.sfx('confirm');
          this.confirmCursor = 1;
          this.confirming = true;
        }
      } else if (row.kind === 'screen') this.change(row, 1);
      else this.change(row, 1);
    }

    if (input.pressed('cancel') || input.pressed('menu')) this.close();
  }

  render() {
    // Arrives over 0.15 s rather than snapping on (F7).
    const k = ease.outCubic(clamp(this.t / 0.15, 0, 1));
    R.alpha(k, () => this.draw());
  }

  draw() {
    R.fill('#000000', 0.65);
    R.box(PANEL.x, PANEL.y, PANEL.w, PANEL.h, C.ink);
    text('SETTINGS', VW / 2, PANEL.y + 6, { align: 'center', color: 'gold' });

    const list = rows();
    this.follow(list);
    const shown = list.slice(this.top, this.top + VISIBLE);
    shown.forEach((row, n) => {
      const i = this.top + n;
      const sel = i === this.cursor;
      const y = PANEL.y + 24 + n * 14;
      if (sel) text('→', PANEL.x + 8, y, { color: 'gold' });
      text(row.label, PANEL.x + 20, y, { color: sel ? 'gold' : 'white' });
      const v = this.value(row);
      if (!v) return;
      // Volumes get a small bar as well as the number, so the level is readable at a
      // glance rather than only as a figure.
      if (row.kind === 'volume') {
        const bw = 60;
        const bx = PANEL.x + PANEL.w - bw - 34;
        R.rect(bx, y + 2, bw, 4, C.steel);
        R.rect(bx, y + 2, Math.round((bw * G.settings[row.id]) / 100), 4, sel ? C.gold : C.cream);
      }
      text(v, PANEL.x + PANEL.w - 10, y, { align: 'right', color: sel ? 'gold' : 'cream' });
    });

    // On the title's line rather than at the ends of the list: the last row reaches the
    // panel's bottom edge, and an arrow there lands on top of its value.
    if (this.top > 0) text('↑', PANEL.x + PANEL.w - 22, PANEL.y + 6, { color: 'mist' });
    if (this.top + VISIBLE < list.length) text('↓', PANEL.x + PANEL.w - 12, PANEL.y + 6, { color: 'mist' });

    // A note takes the hint's line while it is up. Inside the panel it shared a row with
    // "Back", which the short messages happened to clear and a long one would not.
    if (this.msgT > 0) text(this.msg, VW / 2, VH - 12, { align: 'center', color: 'cream' });
    // Named for whatever is being played on, so a thumb isn't told to press Esc (F40).
    else text(`← → change    ${input.label('cancel')} back`, VW / 2, VH - 12, { align: 'center', color: 'mist' });

    if (this.confirming) {
      const w = 200;
      const h = 60;
      const x = Math.round(VW / 2 - w / 2);
      const y = 58;
      R.box(x, y, w, h, C.navy);
      text("Erase your letter? This can't", x + 10, y + 8, { color: 'white' });
      text('be undone.', x + 10, y + 20, { color: 'white' });
      ['Yes, erase it', 'No, keep it'].forEach((label, i) => {
        const sel = i === this.confirmCursor;
        const yy = y + 36 + i * 12;
        if (sel) text('→', x + 10, yy, { color: 'gold' });
        text(label, x + 22, yy, { color: sel ? 'gold' : 'white' });
      });
    }
  }
}

export function openSettings() {
  return new Promise((resolve) => G.push(new SettingsScene(resolve)));
}
