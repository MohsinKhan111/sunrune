// The title screen: a green valley in the afternoon, the logo, "Press Enter", then the
// menu (F2). The cast run across the middle hill while you decide.
import { R, sheets, makeCanvas, solid } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { charSheet } from '../engine/sheets.js';
import { text, bigText } from '../engine/font.js';
import { ease, clamp } from '../engine/ease.js';
import { makeRng } from '../engine/rng.js';

// What the title asks for, on whatever is to hand. Touch names the pad's own button.
const START_PROMPT = { keyboard: 'Press Enter', gamepad: 'Press Start', touch: 'Press A or Start' };

// The leafy tree from the pack (PROPS.T), top tile over bottom tile.
const TREE = [62, 80];
// Where the runners' feet land. Just clear of the near hill's highest point (136), so
// they are always on ground: never floating over it, and never cut off at the knees
// by it either, whatever shape the hills came out.
const RUN_Y = 130;
// Who crosses, in order. Everybody the player is about to meet.
const CAST = ['pip', 'biscuit', 'tilly', 'dot', 'nana', 'dash', 'lute'];

// The ★ beside the logo, once the chapter has been finished.
function readCleared() {
  try {
    return localStorage.getItem('sunrune:cleared') === '1';
  } catch {
    return false;
  }
}

// Sky in horizontal bands with dithered edges, like an old console. Afternoon: deep
// blue overhead, thinning to a thin warm line where it meets the hills. The warm band
// is kept narrow on purpose - any wider and it reads as sand again.
function paintSky() {
  const c = makeCanvas(VW, VH);
  const x = c.getContext('2d');
  const bands = [
    [0, C.blue],
    [26, C.sky],
    [58, C.mist],
    [88, C.cream],
  ];
  for (let i = 0; i < bands.length; i++) {
    const [y0, col] = bands[i];
    const y1 = i + 1 < bands.length ? bands[i + 1][0] : VH;
    x.fillStyle = col;
    x.fillRect(0, y0, VW, y1 - y0);
    if (i > 0) {
      x.fillStyle = bands[i - 1][1];
      for (let py = 0; py < 4; py++) {
        for (let px = 0; px < VW; px++) {
          const keep = py < 2 ? (px + py) % 2 === 0 : (px % 4 === 0 && py === 2) || (px % 4 === 2 && py === 3);
          if (keep) x.fillRect(px, y0 + py, 1, 1);
        }
      }
    }
  }
  return c;
}

// One cloud: overlapping discs flattened along the bottom, white with a mist underside
// so it has a lit top and a shaded belly rather than reading as a blob.
function paintCloud(w, h, seed) {
  const c = makeCanvas(w, h);
  const x = c.getContext('2d');
  const rng = makeRng(seed);
  const blobs = [];
  const n = 3 + Math.floor(rng() * 3);
  for (let i = 0; i < n; i++) {
    const r = (h * (0.55 + rng() * 0.45)) / 2;
    blobs.push({ cx: r + ((w - r * 2) * i) / Math.max(1, n - 1), cy: h - r - rng() * h * 0.12, r });
  }
  const inside = (px, py) => blobs.some((b) => (px + 0.5 - b.cx) ** 2 + (py + 0.5 - b.cy) ** 2 <= b.r * b.r);
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      if (!inside(px, py)) continue;
      x.fillStyle = inside(px, py + 2) ? C.white : C.mist;
      x.fillRect(px, py, 1, 1);
    }
  }
  return c;
}

// A tiling strip of hills (width 640) for parallax. `lift` is headroom above the ridge,
// so a tree planted on it has somewhere to grow without being clipped off the top.
function paintHills(color, top, ridge, amp, seed, { lift = 0, trees = null, treeInk = null } = {}) {
  const W = 640;
  const H = VH - top;
  const c = makeCanvas(W, H);
  const x = c.getContext('2d');
  const k = (n) => (Math.PI * 2 * n) / W;
  const heights = [];
  for (let px = 0; px < W; px++) {
    const h =
      amp * 0.55 * Math.sin(px * k(2) + seed) +
      amp * 0.3 * Math.sin(px * k(5) + seed * 2.1) +
      amp * 0.15 * Math.sin(px * k(11) + seed * 0.7);
    heights.push(Math.round(lift + amp + h));
  }
  for (let px = 0; px < W; px++) {
    const y = heights[px];
    x.fillStyle = color;
    x.fillRect(px, y, 1, H - y);
    if (ridge) {
      x.fillStyle = ridge;
      x.fillRect(px, y, 1, 1);
    }
  }
  if (trees) {
    const stamp = treeStamp(treeInk);
    for (const px of trees) {
      // Two tiles tall, planted 2 px into the slope so it doesn't perch on the line.
      const y = heights[px] - 30;
      TREE.forEach((tile, i) => {
        x.drawImage(stamp, (tile % 18) * 16, Math.floor(tile / 18) * 16, 16, 16, px - 8, y + i * 16, 16, 16);
      });
    }
  }
  return { canvas: c, top };
}

// The tiles sheet flattened to one colour, for trees seen at a distance. Cached per
// colour: a hill is painted once at boot, but it is painted for every strip that wants
// trees, and the flattening is the expensive half.
const treeStamps = new Map();
function treeStamp(color) {
  let stamp = treeStamps.get(color);
  if (!stamp) {
    stamp = solid(sheets.tiles, color);
    treeStamps.set(color, stamp);
  }
  return stamp;
}

export class TitleScene {
  constructor({ onChoose, cleared = readCleared(), hasSave = false } = {}) {
    this.opaque = true;
    this.t = 0;
    this.pressed = false;
    this.menuT = 0;
    this.cursor = 0;
    this.onChoose = onChoose ?? (() => {});
    this.cleared = cleared;
    this.items = [
      { id: 'new', label: 'New Game' },
      { id: 'continue', label: 'Continue', disabled: !hasSave, note: 'No letters yet' },
      { id: 'settings', label: 'Settings' },
      { id: 'credits', label: 'Credits' },
    ];
    this.sky = paintSky();
    // Three ridges, lightest and bluest furthest away: hills read as distance the same
    // way they do out of a window. Screen rows are in the comments because the runners
    // and the tree headroom are both measured against them.
    this.far = paintHills(C.steel, 96, C.mist, 8, 1.3); // ridge 96-112
    this.mid = paintHills(C.teal, 78, C.mint, 11, 2.7, {
      lift: 34, // ridge 112-134
      trees: [58, 96, 214, 268, 402, 436, 560],
      treeInk: C.sea,
    });
    this.near = paintHills(C.sea, 136, C.teal, 15, 4.1); // ridge 136-166
    const rng = makeRng(7);
    this.clouds = [26, 34, 42].map((h, i) => paintCloud(30 + i * 12, h / 2 + 4, 11 + i));
    this.sky2 = Array.from({ length: 7 }, (_, i) => ({
      art: this.clouds[i % this.clouds.length],
      x: rng() * (VW + 60) - 30,
      y: 10 + rng() * 52,
      v: 2 + rng() * 5,
    }));
    // Seeds on the breeze, drifting up as often as across. The desert's blown sand was
    // the same handful of pixels going one way in a hurry.
    this.motes = Array.from({ length: 30 }, () => ({
      x: rng() * VW,
      y: 60 + rng() * 110,
      v: 7 + rng() * 14,
      rise: 2 + rng() * 5,
      c: rng() < 0.4 ? C.mint : C.cream,
    }));
    this.runners = [];
    this.runT = 1.1;
    this.runN = 0;
    this.rng = rng;
  }

  // Somebody crosses every few seconds, alternating sides, and every third crossing has
  // Biscuit galloping along behind - which is what he does for the whole chapter.
  addRunner(id, dir, behind) {
    this.runners.push({
      id,
      dir,
      v: 40 + this.rng() * 16,
      x: dir > 0 ? -16 - behind : VW + 16 + behind,
      t: this.rng(),
    });
  }

  sendRunner() {
    const dir = this.runN % 2 === 0 ? 1 : -1;
    const id = CAST[this.runN % CAST.length];
    this.runN++;
    this.addRunner(id, dir, 0);
    if (this.runN % 3 === 0 && id !== 'biscuit') this.addRunner('biscuit', dir, 22);
  }

  update(dt, isTop) {
    this.t += dt;
    for (const c of this.sky2) {
      c.x += c.v * dt;
      if (c.x > VW + 4) c.x = -c.art.width - 4;
    }
    for (const m of this.motes) {
      m.x += m.v * dt;
      m.y -= m.rise * dt;
      m.y += Math.sin(this.t * 1.6 + m.x * 0.05) * 5 * dt;
      if (m.x > VW + 2) m.x = -2;
      if (m.y < 52) m.y = VH - 2;
    }
    this.runT -= dt;
    if (this.runT <= 0) {
      this.sendRunner();
      this.runT = 3.4 + this.rng() * 2.6;
    }
    for (const r of this.runners) {
      r.x += r.dir * r.v * dt;
      r.t += dt;
    }
    this.runners = this.runners.filter((r) => r.x > -24 && r.x < VW + 24);
    if (!isTop) return;
    if (!this.pressed) {
      if (this.t > 0.6 && (input.pressed('confirm') || input.pressed('menu'))) {
        this.pressed = true;
        this.menuT = 0;
        this.onChoose('start');
      }
      return;
    }
    this.menuT += dt;
    const n = this.items.length;
    if (input.repeat('down')) {
      this.cursor = (this.cursor + 1) % n;
      this.onChoose('move');
    }
    if (input.repeat('up')) {
      this.cursor = (this.cursor + n - 1) % n;
      this.onChoose('move');
    }
    if (input.pressed('confirm') && this.menuT > 0.2) {
      const item = this.items[this.cursor];
      this.onChoose(item.disabled ? 'disabled' : item.id);
    }
  }

  drawStrip(strip, speed) {
    const off = Math.floor((this.t * speed) % 640);
    const h = strip.canvas.height;
    R.img(strip.canvas, off, 0, Math.min(VW, 640 - off), h, 0, strip.top);
    if (640 - off < VW) R.img(strip.canvas, 0, 0, VW - (640 - off), h, 640 - off, strip.top);
  }

  render() {
    R.pic(this.sky, 0, 0);
    // An afternoon sun, high and small, with a soft halo that breathes.
    const sx = 268;
    const sy = 28;
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 1.6);
    R.ellipse(sx, sy, 50 + pulse * 5, 50 + pulse * 5, C.butter, 0.16);
    R.ellipse(sx, sy, 36 + pulse * 3, 36 + pulse * 3, C.butter, 0.22);
    R.ellipse(sx, sy, 22, 22, C.gold);
    R.ellipse(sx - 2, sy - 2, 15, 15, C.butter, 0.7);
    for (const c of this.sky2) R.pic(c.art, Math.round(c.x), Math.round(c.y), { alpha: 0.9 });
    // The Gate on the far ridge, stone rather than the desert's red rock, still lit.
    const gx = 58;
    const gy = 78;
    R.rect(gx, gy, 3, 16, C.dusk);
    R.rect(gx + 13, gy, 3, 16, C.dusk);
    R.rect(gx - 1, gy - 2, 18, 3, C.dusk);
    R.ellipse(gx + 8, gy + 8, 8, 10, C.lilac, 0.5 + pulse * 0.4);
    R.ellipse(gx + 8, gy + 8, 4, 6, C.white, 0.6 + pulse * 0.3);
    this.drawStrip(this.far, 3);
    this.drawStrip(this.mid, 7);
    this.renderRunners();
    this.drawStrip(this.near, 14);
    for (const m of this.motes) R.rect(Math.round(m.x), Math.round(m.y), 1, 1, m.c, 0.75);

    // Logo drops in with a bounce.
    const k = clamp((this.t - 0.2) / 0.9, 0, 1);
    const ly = Math.round(-40 + (30 + 40) * ease.outBounce(k));
    const lift = this.pressed ? Math.round(-8 * ease.outCubic(clamp(this.menuT / 0.4, 0, 1))) : 0;
    bigText('SUNRUNE', VW / 2, ly + lift, { scale: 2, color: 'gold', align: 'center' });
    if (this.cleared) text('★', VW / 2 + 92, ly + 4 + lift, { color: 'gold' });
    const subA = clamp((this.t - 1.1) / 0.6, 0, 1);
    if (subA > 0) text('Chapter 1 · Return to Sender', VW / 2, ly + 38 + lift, { align: 'center', color: 'cream', alpha: subA });

    if (!this.pressed) {
      if (this.t > 1.4 && Math.floor(this.t * 2) % 2 === 0) {
        text(START_PROMPT[input.device] ?? START_PROMPT.keyboard, VW / 2, 142, { align: 'center' });
      }
    } else {
      this.renderMenu();
    }
    text('DEMO', VW - 6, VH - 11, { align: 'right', color: 'cream', alpha: 0.8 });
  }

  // The cast, mid-stride on the middle hill. Frames 0 and 1 are the walk (DESIGN
  // "Motion"), with the 1 px bob a step gives, and a shadow so they are on the grass
  // rather than in front of it.
  renderRunners() {
    for (const r of this.runners) {
      const sheet = charSheet[r.id];
      if (!sheet) continue;
      const frame = Math.floor(r.t / 0.09) % 2;
      const x = Math.round(r.x);
      R.shadow(x, RUN_Y - 1, 13, 4, 0.22);
      R.sprite(sheet, frame, x - 12, RUN_Y - 24 - frame, { flip: r.dir < 0 });
    }
  }

  renderMenu() {
    const k = ease.outCubic(clamp(this.menuT / 0.3, 0, 1));
    const x0 = VW / 2 - 48;
    this.items.forEach((item, i) => {
      const y = Math.round(96 + i * 19 + (1 - k) * 12);
      const sel = i === this.cursor;
      R.alpha(k, () => {
        const base = sel ? 61 : 65;
        R.ui(base, x0, y);
        R.ui(base + 1, x0 + 16, y);
        R.ui(base + 1, x0 + 32, y);
        R.ui(base + 1, x0 + 48, y);
        R.ui(base + 1, x0 + 64, y);
        R.ui(base + 2, x0 + 80, y);
        const col = item.disabled ? 'steel' : 'white';
        text(item.label, VW / 2, y + 4, { align: 'center', color: col });
        if (sel) R.ui(77, x0 - 18 + Math.round(Math.sin(this.t * 8)), y);
      });
    });
    const cur = this.items[this.cursor];
    // 173 clipped the note's bottom row against the screen edge; this is the last row
    // that still clears the Credits button above it.
    if (cur.disabled && cur.note) text(cur.note, VW / 2, 170, { align: 'center', color: 'cream', alpha: k });
  }
}
