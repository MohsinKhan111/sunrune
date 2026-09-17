// The letter from future Pip, and the ending: chapter card, stats, credits (F20).
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text, bigText, textWidth } from '../engine/font.js';
import { ease, clamp } from '../engine/ease.js';
import { audio } from '../engine/audio.js';

const CREDITS = [
  'SUNRUNE',
  'Chapter 1: Return to Sender',
  '',
  'Story, code and music',
  'Claude',
  '',
  'Art and sound effects',
  'Kenney · kenney.nl',
  'Creative Commons Zero',
  '',
  'Executive producer',
  'You',
  '',
  'Pip and Biscuit will return in',
  'Chapter 2: Eight Gates',
  '',
  'Thanks for playing!',
];

export function formatTime(ms) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// A letter on cream paper: the only light panel in the game (DESIGN.md).
class LetterScene {
  constructor(lines, resolve) {
    this.opaque = false;
    this.blocksUpdate = true;
    this.lines = lines;
    this.resolve = resolve;
    this.t = 0;
  }

  update(dt, isTop) {
    this.t += dt;
    if (isTop && this.t > 0.4 && input.pressed('confirm')) {
      audio.sfx('confirm');
      G.pop(this);
      this.resolve();
    }
  }

  render() {
    R.fill('#000000', 0.5);
    const w = 240;
    const h = 128;
    const x = Math.round(VW / 2 - w / 2);
    const y = Math.round(VH / 2 - h / 2 - 4 + (1 - ease.outCubic(clamp(this.t / 0.5, 0, 1))) * 10);
    R.rect(x + 1, y, w - 2, h, C.dirt);
    R.rect(x, y + 1, w, h - 2, C.dirt);
    R.rect(x + 2, y + 2, w - 4, h - 4, C.cream);
    const hero = G.state?.name ?? 'Pip';
    this.lines.forEach((line, i) => {
      text(line.replaceAll('{hero}', hero), x + 14, y + 12 + i * 13, { color: 'ink', shadow: false });
    });
    R.ellipse(x + w - 26, y + h - 22, 16, 14, C.red);
    R.ellipse(x + w - 26, y + h - 22, 9, 8, C.brick);
    if (this.t > 0.8) text('▼', x + w - 16, y + h - 14 + Math.round(Math.sin(this.t * 6)), { color: 'ink', shadow: false });
  }
}

export function letter(lines) {
  return new Promise((resolve) => G.push(new LetterScene(lines, resolve)));
}

// Chapter card → stats → credits, then hands back.
class EndingScene {
  // `phase` lets the title start straight at the credits, so there is only ever one
  // credit roll in the game rather than a second copy that drifts out of step.
  constructor(state, resolve, { phase = 0, music = 'chapter' } = {}) {
    this.opaque = true;
    this.blocksUpdate = true;
    this.state = state;
    this.resolve = resolve;
    this.phase = phase;
    this.t = 0;
    audio.music(music);
  }

  next() {
    this.phase++;
    this.t = 0;
    if (this.phase > 2) {
      G.pop(this);
      this.resolve();
    }
  }

  update(dt, isTop) {
    this.t += dt;
    const skip = isTop && this.t > 0.6 && input.pressed('confirm');
    const dur = [4.2, 6.5, CREDITS.length * 1.15 + 3][this.phase] ?? 4;
    if (this.t >= dur || skip) this.next();
  }

  render() {
    R.fill('#000000');
    if (this.phase === 0) {
      const k = ease.outCubic(clamp(this.t / 0.6, 0, 1));
      bigText('SUNRUNE', VW / 2, 44 + (1 - k) * 6, { align: 'center', color: 'gold', scale: 2 });
      if (this.t > 0.8) bigText('CHAPTER 1 COMPLETE', VW / 2, 96, { align: 'center', style: 2 });
      if (this.t > 1.4) text('Return to Sender', VW / 2, 118, { align: 'center', color: 'cream' });
      return;
    }
    if (this.phase === 1) {
      const s = this.state.stats;
      bigText('YOUR CHAPTER', VW / 2, 18, { align: 'center', color: 'gold', style: 2 });
      const rows = [
        ['Time', formatTime(s.playMs)],
        ['Level', `LV ${this.state.party[0].lv}`],
        ['Battles won', String(s.battlesWon)],
        ['Chests opened', `${s.chests} of 8`],
        ['Secrets found', `${s.secrets} of 1`],
      ];
      rows.forEach(([label, value], i) => {
        const y = 48 + i * 16;
        const k = clamp((this.t - 0.3 - i * 0.25) / 0.3, 0, 1);
        if (k <= 0) return;
        R.alpha(k, () => {
          text(label, VW / 2 - 70, y, { color: 'mist' });
          text(value, VW / 2 + 70, y, { align: 'right', color: 'white' });
        });
      });
      if (this.t > 2.2) {
        text(`Press ${input.label('confirm')}`, VW / 2, VH - 22, { align: 'center', color: 'cream', alpha: 0.8 });
      }
      return;
    }
    const scroll = VH + 6 - this.t * 26;
    CREDITS.forEach((line, i) => {
      const y = Math.round(scroll + i * 14);
      if (y < -12 || y > VH) return;
      const big = i === 0;
      if (big) bigText(line, VW / 2, y - 4, { align: 'center', color: 'gold' });
      else text(line, VW / 2, y, { align: 'center', color: i === 1 ? 'cream' : 'white' });
    });
  }
}

export function ending(state) {
  return new Promise((resolve) => G.push(new EndingScene(state, resolve)));
}

// The credit roll on its own, from the title (F2). No stats screen: there is no
// chapter behind it.
export function credits() {
  return new Promise((resolve) => {
    G.push(new EndingScene(null, resolve, { phase: 2, music: 'ending' }));
  });
}
