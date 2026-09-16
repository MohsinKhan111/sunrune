// The touch pad's layout maths (F40). padLayout decides how much of the window the
// picture gets and how much the controls get, at every shape of phone and tablet. The
// promises worth pinning are the ones a screenshot can't check on its own: a control
// never wider than the gutter holding it, a stage that still fits after the pad has
// taken its room, and buttons that stay big enough to hit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { padLayout, FLUID_DPR } from '../../src/ui/touch.js';
import { fitScale, VW, VH } from '../../src/engine/screen.js';

// The pad lets a dense screen fill its stage (D26); the layout maths and these checks
// have to agree about that or they are measuring two different games.
const fluid = (dpr) => dpr >= FLUID_DPR;

// Real devices, in CSS pixels and their real pixel densities, plus the awkward shapes:
// a very small phone, a square-ish window, and a desktop window with the pad forced on.
const DEVICES = [
  ['iPhone SE upright', 375, 667, 2],
  ['iPhone SE sideways', 667, 375, 2],
  ['iPhone 14 upright', 390, 844, 3],
  ['iPhone 14 sideways', 844, 390, 3],
  ['iPhone 14 upright at ×2', 390, 844, 2],
  ['iPhone 14 sideways at ×2', 844, 390, 2],
  ['Pixel 7 upright', 412, 915, 2.6],
  ['Pixel 7 sideways', 915, 412, 2.6],
  ['iPad upright', 820, 1180, 2],
  ['iPad sideways', 1180, 820, 2],
  ['iPad Pro sideways', 1366, 1024, 2],
  ['small Android upright', 320, 568, 2],
  ['small Android sideways', 568, 320, 2],
  ['a square window', 700, 700, 1],
  ['a desktop window, pad forced on', 1280, 720, 1],
];

// The smallest a control may be and still be an easy target for a thumb. 44 px is the
// figure both Apple and Google publish; the face buttons are 43% of the cluster, which
// is the tightest thing the cluster size has to satisfy.
const MIN_TAP = 44;
const BUTTON_SHARE = 0.43;

test('every device gets one of the two layouts, the one that matches its shape', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    assert.equal(lay.orientation, h >= w ? 'portrait' : 'landscape', name);
  }
});

test('a gutter always has room for the cluster inside it', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'landscape') continue;
    assert.ok(lay.gutter >= lay.unit, `${name}: a ${lay.unit}px cluster in a ${lay.gutter}px gutter`);
  }
});

test('the two gutters never eat the whole window', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'landscape') continue;
    const stage = w - 2 * lay.gutter;
    assert.ok(stage >= w * 0.35, `${name}: only ${stage}px of ${w} left for the picture`);
  }
});

test('the picture fits the stage the pad leaves it, sideways', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'landscape') continue;
    const stage = w - 2 * lay.gutter;
    const scale = fitScale(stage * dpr, h * dpr, fluid(dpr));
    assert.ok(scale > 0, `${name}: no scale fits`);
    assert.ok((VW * scale) / dpr <= stage + 1, `${name}: the picture is wider than its stage`);
    assert.ok((VH * scale) / dpr <= h + 1, `${name}: the picture is taller than the window`);
  }
});

test('upright, the stage and the controls both fit the window', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'portrait') continue;
    // The cluster plus its padding, and the smallest the band between them can be.
    const needed = lay.stage + lay.unit + 34;
    assert.ok(needed <= h, `${name}: ${needed}px of layout in a ${h}px window`);
  }
});

test('upright, the stage is the height the picture will actually use', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'portrait') continue;
    // 24 px is the margin either side of the sunken screen.
    const scale = fitScale((w - 24) * dpr, lay.stage * dpr, fluid(dpr));
    const picture = (VH * scale) / dpr;
    assert.ok(
      Math.abs(picture - lay.stage) <= 2 || lay.stage <= 110,
      `${name}: a ${lay.stage}px stage for a ${Math.round(picture)}px picture`,
    );
  }
});

test('two clusters and the gap between them fit across an upright window', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    if (lay.orientation !== 'portrait') continue;
    assert.ok(2 * lay.unit <= w - 16, `${name}: two ${lay.unit}px clusters across ${w}px`);
  }
});

test('a face button is never too small to hit, on any of them', () => {
  for (const [name, w, h, dpr] of DEVICES) {
    const lay = padLayout(w, h, dpr);
    const button = lay.unit * BUTTON_SHARE;
    assert.ok(button >= MIN_TAP, `${name}: a ${button.toFixed(1)}px button is under ${MIN_TAP}px`);
  }
});

test('turning a device gives the picture more room than holding it upright', () => {
  // The rotate hint promises this in so many words, so it had better be true. Checked on
  // the pairs above that are the same device both ways round.
  const pairs = [[375, 667, 2], [390, 844, 3], [390, 844, 2], [412, 915, 2.6], [820, 1180, 2]];
  for (const [w, h, dpr] of pairs) {
    const up = padLayout(w, h, dpr);
    const over = padLayout(h, w, dpr);
    const upright = (VW * fitScale((w - 24) * dpr, up.stage * dpr, fluid(dpr))) / dpr;
    const sideways = (VW * fitScale((h - 2 * over.gutter) * dpr, w * dpr, fluid(dpr))) / dpr;
    assert.ok(sideways > upright, `${w}x${h}: ${sideways}px sideways is no better than ${upright}px upright`);
  }
});

test('the layout is the same shape whatever the density', () => {
  // Density changes how big the picture can be, never which way the pad is laid out or
  // whether its buttons are usable.
  for (const [name, w, h] of DEVICES) {
    const shapes = [1, 2, 2.6, 3].map((dpr) => padLayout(w, h, dpr));
    for (const lay of shapes) {
      assert.equal(lay.orientation, shapes[0].orientation, name);
      assert.ok(lay.unit * BUTTON_SHARE >= MIN_TAP, `${name}: button too small`);
    }
  }
});
