// Touch controls (F40): a handheld's pad around the game for phones and tablets - a
// cross D-pad, four face buttons, Start and a fullscreen chip. Built in HTML rather than
// on the canvas (D25) so it can take its own room in the page grid: the picture shrinks
// to make space and a button never lands on the game.
//
// Nothing here knows what the game does with a press. Every control ends up in
// input.touch(action, down), the same four actions the keyboard and a gamepad feed, so
// a scene that can be played with a keyboard can be played with a thumb.
import { input } from '../engine/input.js';
import { screen, fitScale } from '../engine/screen.js';
import { G } from '../game.js';

const HINT_KEY = 'sunrune:rotatehint';

// A: talk and confirm, B: back out, X: hold to run, Y and Start: the pause menu.
// The menu is on two buttons on purpose - it is the way out of every panel in the game,
// so it should never be the button a player cannot find.
const FACE = [
  { cls: 'y', act: 'menu', label: 'Y', role: 'Menu' },
  { cls: 'x', act: 'run', label: 'X', role: 'Run' },
  { cls: 'a', act: 'confirm', label: 'A', role: 'OK' },
  { cls: 'b', act: 'cancel', label: 'B', role: 'Back' },
];

// The same four, read in the order a controller is usually described rather than the
// order they are laid out in. Only shown upright, where there is room for the words.
const LEGEND = ['a', 'b', 'x', 'y'].map((cls) => FACE.find((f) => f.cls === cls));

const ROTATE_MARK = `<svg class="hint-mark" viewBox="0 0 24 24" fill="none" stroke="currentColor"
  stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <rect x="8" y="2.5" width="8" height="19" rx="2"/><path d="M11 5.4h2"/><path d="M10.8 18.6h2.4"/>
</svg>`;

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// A screen this dense or better gets a picture that fills its stage rather than one
// pinned to the last whole-number step (D26).
export const FLUID_DPR = 2;

// The smallest a cluster may get, and the breathing room around it inside its gutter.
// A face button is 43% of the cluster, and 44 px is the smallest comfortable target
// both Apple and Google publish - so the cluster floor is what makes that hold.
const MIN_UNIT = 104;
const CLUSTER_PAD = 18;
// What the controls and the hint band need in an upright window, on top of the cluster.
const CONTROLS_PAD = 34;
const BAND_MIN = 92;
// The margin either side of the sunken screen upright (touch.css), counted here so the
// height handed to the stage matches the width the picture will really have.
const STAGE_INSET = 24;

// How big the pad is, and how much room the picture gets, at a given window size and
// pixel density. Pure, so a test can check the shapes that matter without a browser.
//
// The picture only ever comes in whole-number sizes (D10), so the stage is given exactly
// the size that picture will be and the leftover goes to the pad rather than to a black
// band nobody wanted: upright that means a taller shell face, sideways it means bigger
// buttons. The result is a screen with a bezel, which is what a handheld looks like.
export function padLayout(w, h, dpr = 1, fluid = dpr >= FLUID_DPR) {
  const fit = (fw, fh) => fitScale(fw, fh, fluid);
  if (h >= w) {
    // Upright: two clusters side by side along the bottom, one per half.
    const unit = Math.round(clamp(w / 2 - 26, MIN_UNIT, 196));
    const room = Math.max(120, h - (unit + CONTROLS_PAD) - BAND_MIN);
    const stage = Math.round(clamp((180 * fit((w - STAGE_INSET) * dpr, room * dpr)) / dpr, 110, room));
    return { orientation: 'portrait', gutter: 0, unit, stage, tight: unit < 126 };
  }
  // Sideways: a cluster in each gutter. The gutters start at what a thumb wants, then
  // widen to take back whatever width the picture could not use - which on a fluid
  // screen is nothing, and on a whole-number one is the difference to the next step.
  const pref = Math.round(clamp(Math.min(w * 0.145, h * 0.46), MIN_UNIT, 158)) + CLUSTER_PAD;
  const picture = (320 * fit(Math.max(160, w - 2 * pref) * dpr, h * dpr)) / dpr;
  const gutter = Math.max(pref, Math.floor((w - picture) / 2));
  const unit = Math.round(clamp(Math.min(gutter - CLUSTER_PAD, h * 0.46), MIN_UNIT, 200));
  return { orientation: 'landscape', gutter, unit, stage: 0, tight: unit < 118 };
}

export const touch = {
  on: false,
  el: null,
  shell: null,
  dpad: null,
  arms: {},
  hint: null,
  // Whether this looks like a device a finger is the main way in.
  coarse: false,
  // Set once a key is pressed or a gamepad turns up: something other than a thumb can
  // play, so a laptop with a touchscreen isn't stuck with a pad it never wanted.
  // Touching the screen again brings it back.
  otherInput: false,
  pointers: new Map(),
  dpadRect: null,
  dir: { up: false, down: false, left: false, right: false },

  init(shell) {
    this.shell = shell;
    this.coarse = detectCoarse();
    this.build();
    this.apply();

    const otherWayIn = () => {
      if (this.otherInput) return;
      this.otherInput = true;
      this.apply();
    };
    window.addEventListener('keydown', otherWayIn);
    window.addEventListener('gamepadconnected', otherWayIn);
    // A finger on the screen anywhere, pad or game, says the pad is wanted again.
    window.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch') return;
      this.coarse = true;
      if (!this.otherInput) return;
      this.otherInput = false;
      this.apply();
    }, { capture: true });

    const relayout = () => this.layout();
    window.addEventListener('resize', relayout);
    window.addEventListener('orientationchange', relayout);
    window.visualViewport?.addEventListener('resize', relayout);

    // A finger that is lifted while the tab is going away never sends pointerup.
    const drop = () => this.releaseAll();
    window.addEventListener('blur', drop);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) drop();
    });
    window.addEventListener('pointermove', (e) => this.onMove(e), { passive: false });
    window.addEventListener('pointerup', (e) => this.onUp(e));
    window.addEventListener('pointercancel', (e) => this.onUp(e));
  },

  // ---- the pad itself ----

  build() {
    const pad = document.createElement('div');
    pad.id = 'pad';
    pad.innerHTML = `
      <div class="cluster cluster-mid">
        <div class="hint" role="note">
          ${ROTATE_MARK}
          <div class="hint-copy">
            <b>Rotate for a bigger screen</b>
            <span>Turn your device sideways. The controls move to the edges and the picture fills the middle.</span>
          </div>
          <button class="hint-x" type="button" aria-label="Hide this tip">&times;</button>
        </div>
        <div class="brand" aria-hidden="true">SUNRUNE</div>
        <div class="grille" aria-hidden="true"></div>
        <div class="band-foot">
          <div class="legend" aria-hidden="true">
            ${LEGEND.map((f) => `<span class="leg ${f.cls}"><i>${f.label}</i>${f.role}</span>`).join('')}
          </div>
          <div class="pills">
            <button class="pill" type="button" data-act="menu" aria-label="Menu">Start</button>
            ${canFullscreen() ? '<button class="pill chip" type="button" data-act="fullscreen" aria-label="Fullscreen">&#9974;</button>' : ''}
          </div>
        </div>
      </div>
      <div class="cluster cluster-left">
        <div class="dpad" role="group" aria-label="Direction pad">
          <div class="dpad-base"></div>
          ${['up', 'down', 'left', 'right'].map((d) => `<i class="arm ${d}"></i>`).join('')}
          ${['up', 'down', 'left', 'right'].map((d) => `<i class="arrow ${d}"></i>`).join('')}
          <div class="dpad-hub"></div>
        </div>
      </div>
      <div class="cluster cluster-right">
        <div class="face">
          ${FACE.map((f) => `<button class="btn ${f.cls}" type="button" data-act="${f.act}" data-role="${f.role}" aria-label="${f.role}">${f.label}</button>`).join('')}
        </div>
      </div>`;
    this.shell.append(pad);
    this.el = pad;
    this.dpad = pad.querySelector('.dpad');
    for (const d of ['up', 'down', 'left', 'right']) this.arms[d] = pad.querySelector(`.arm.${d}`);
    this.hint = pad.querySelector('.hint');

    for (const cluster of pad.querySelectorAll('.cluster')) {
      cluster.addEventListener('pointerdown', (e) => this.onDown(e), { passive: false });
    }
    // Long-press on a control is a browser habit, not a game one.
    pad.addEventListener('contextmenu', (e) => e.preventDefault());

    pad.querySelector('.hint-x').addEventListener('click', () => this.dismissHint());
    try {
      if (localStorage.getItem(HINT_KEY) === '1') document.body.classList.add('hint-done');
    } catch {
      // Storage blocked: the tip shows again next time, which is the harmless way round.
    }
  },

  dismissHint() {
    document.body.classList.add('hint-done');
    try {
      localStorage.setItem(HINT_KEY, '1');
    } catch {
      // Nothing to do; the tip is a nicety, not state the game needs.
    }
    this.layout();
  },

  // ---- showing and hiding ----

  // 'on' is the player's word and beats everything; 'auto' follows the device (F3).
  //
  // There is deliberately no "off". On a phone the pad is the only way to press
  // anything, and a setting that takes it away would leave a player holding a game they
  // cannot put down - no way back into the menu to undo it. Hiding it is instead
  // automatic and reversible: a key or a gamepad says there is another way in and the
  // pad goes, a finger on the screen says there is not and it comes back.
  wanted() {
    if ((G.settings?.touchControls ?? 'auto') === 'on') return true;
    return this.coarse && !this.otherInput;
  },

  apply() {
    const on = this.wanted();
    if (on === this.on) return;
    this.on = on;
    document.body.classList.toggle('pad-on', on);
    if (!on) this.releaseAll();
    // A pad on screen means a thumb is playing: prompts should say A, not Z.
    else if (input.device !== 'gamepad') input.device = 'touch';
    this.layout();
  },

  layout() {
    if (!this.on) {
      document.body.classList.remove('pad-portrait', 'pad-landscape', 'pad-tight');
      screen.fluid = false;
      screen.resize();
      return;
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    // The picture may fill its stage while the pad is up on a dense screen (D26). Set
    // before the layout, because the layout asks what size the picture will come out.
    screen.fluid = dpr >= FLUID_DPR;
    const lay = padLayout(w, h, dpr);
    const body = document.body;
    body.classList.toggle('pad-portrait', lay.orientation === 'portrait');
    body.classList.toggle('pad-landscape', lay.orientation === 'landscape');
    body.classList.toggle('pad-tight', lay.tight);
    body.style.setProperty('--unit', `${lay.unit}px`);
    body.style.setProperty('--gut', `${lay.gutter}px`);
    body.style.setProperty('--stage-h', lay.stage ? `${lay.stage}px` : 'auto');
    screen.resize();
  },

  // ---- pressing ----

  set(action, down) {
    input.touch(action, down);
  },

  buzz() {
    if (G.settings?.vibrate === false) return;
    try {
      navigator.vibrate?.(9);
    } catch {
      // Not every browser has it, and some refuse without a gesture. Never worth failing.
    }
  },

  // The control under a point, or null. Used on the way down and on every move, so a
  // thumb can slide from one button to the next the way it does on a real pad.
  hit(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el || !this.el.contains(el)) return null;
    if (el.closest('.dpad')) return { type: 'dpad' };
    const btn = el.closest('[data-act]');
    return btn ? { type: 'btn', act: btn.dataset.act, el: btn } : null;
  },

  onDown(e) {
    if (!this.on) return;
    if (e.target.closest('.hint-x')) return; // the tip's own close button
    e.preventDefault();
    const spot = this.hit(e.clientX, e.clientY);
    if (!spot) return;
    if (spot.type === 'dpad') {
      this.pointers.set(e.pointerId, { type: 'dpad' });
      this.dpad.classList.add('held');
      this.dpadRect = this.dpad.getBoundingClientRect();
      this.aim(e.clientX, e.clientY);
      this.buzz();
      return;
    }
    this.pointers.set(e.pointerId, { type: 'btn', act: spot.act, el: spot.el });
    this.pressButton(spot, true);
    this.buzz();
  },

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.type === 'dpad') {
      this.aim(e.clientX, e.clientY);
      return;
    }
    // Slid onto a different button: let go of the old one and take the new.
    const spot = this.hit(e.clientX, e.clientY);
    const now = spot && spot.type === 'btn' ? spot.act : null;
    if (now === p.act) return;
    this.pressButton(p, false);
    p.act = now;
    p.el = spot && spot.type === 'btn' ? spot.el : null;
    if (now) {
      this.pressButton(p, true);
      this.buzz();
    }
  },

  onUp(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.type === 'dpad') {
      if (![...this.pointers.values()].some((q) => q.type === 'dpad')) {
        this.dpad.classList.remove('held');
        this.dpadRect = null;
        this.aimNone();
      }
      return;
    }
    this.pressButton(p, false);
    // Fullscreen is asked for here rather than through the input queue: browsers only
    // grant it inside the gesture that asked, and a tap is that gesture.
    if (p.act === 'fullscreen') screen.setFullscreen(!screen.isFullscreen());
  },

  pressButton(p, down) {
    if (!p.act) return;
    p.el?.classList.toggle('on', down);
    if (p.act !== 'fullscreen') this.set(p.act, down);
  },

  releaseAll() {
    for (const p of this.pointers.values()) {
      if (p.type === 'btn') this.pressButton(p, false);
    }
    this.pointers.clear();
    this.dpad?.classList.remove('held');
    this.dpadRect = null;
    this.aimNone();
  },

  // ---- the cross ----

  // Direction from where the thumb is, not from which arm it started on: a thumb rolls,
  // and a pad that only answers the arm it was first put on feels stuck. The dominant
  // axis is always on; the other joins once it is nearly as far, which gives the eight
  // directions the game walks in (F5) with the four cardinals getting the wider share.
  aim(px, py) {
    // Measured once when the thumb lands rather than on every move: the cross cannot
    // change size mid-press, and reading layout per move event is how a pad gets janky.
    const r = this.dpadRect ?? this.dpad.getBoundingClientRect();
    const dx = (px - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (py - (r.top + r.height / 2)) / (r.height / 2);
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const major = Math.max(ax, ay);
    if (major < 0.24) return this.aimNone();
    const edge = major * 0.48;
    this.aimAt({
      left: dx < 0 && ax >= edge,
      right: dx > 0 && ax >= edge,
      up: dy < 0 && ay >= edge,
      down: dy > 0 && ay >= edge,
    });
  },

  aimNone() {
    this.aimAt({ up: false, down: false, left: false, right: false });
  },

  aimAt(next) {
    for (const d of ['up', 'down', 'left', 'right']) {
      if (next[d] === this.dir[d]) continue;
      this.dir[d] = next[d];
      this.arms[d]?.classList.toggle('on', next[d]);
      this.set(d, next[d]);
    }
  },
};

// "(pointer: coarse)" asks about the *main* way into this device, which is the question
// worth asking: a laptop with a touchscreen and a mouse answers no, and should - it gets
// the keyboard, not a pad it never asked for. maxTouchPoints is only the fall-back for a
// browser too old to answer, and it cannot tell those two apart.
function detectCoarse() {
  try {
    const q = window.matchMedia?.('(pointer: coarse)');
    if (q) return !!q.matches;
    return navigator.maxTouchPoints > 1;
  } catch {
    return false;
  }
}

// iPhone Safari has no fullscreen for anything but a video. A button that cannot do what
// it says is worse than no button, so on those it is not drawn at all.
function canFullscreen() {
  return typeof document !== 'undefined' && document.fullscreenEnabled === true;
}
