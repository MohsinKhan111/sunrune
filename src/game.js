// The shared game object: the scene stack, screen fades and timers.
// Scenes: { update(dt, isTop), render(), enter?(), exit?(), opaque?, blocksUpdate?, aboveFade? }
import { R } from './engine/gfx.js';
import { C } from './engine/palette.js';

export const G = {
  stack: [],
  time: 0,
  timers: [],
  fadeState: { a: 0, from: 0, to: 0, t: 0, dur: 0, color: '#000000', resolve: null },
  state: null,
  settings: null,
  params: new URLSearchParams(),
  debug: false,

  push(scene) {
    this.stack.push(scene);
    scene.enter?.();
    return scene;
  },

  pop(scene) {
    const i = scene ? this.stack.lastIndexOf(scene) : this.stack.length - 1;
    if (i < 0) return;
    const [s] = this.stack.splice(i, 1);
    s.exit?.();
  },

  replace(scene) {
    while (this.stack.length) this.pop();
    return this.push(scene);
  },

  top() {
    return this.stack[this.stack.length - 1];
  },

  wait(sec) {
    return new Promise((resolve) => this.timers.push({ t: sec, resolve }));
  },

  // Fades a full-screen colour to alpha `to` over `sec` seconds.
  fade(to, sec = 0.25, color) {
    const f = this.fadeState;
    f.resolve?.();
    if (color) f.color = color;
    // Reduce flashing (F3): no full-screen white snaps anywhere in the game. Softening
    // it here covers every flash at once - the theft, the Gate relighting and both
    // chapter fades - rather than each call site remembering to ask.
    if (this.settings?.reduceFlashing && f.color === '#ffffff') {
      f.color = C.cream;
      sec = Math.max(sec, 0.34);
    }
    f.from = f.a;
    f.to = to;
    f.t = 0;
    f.dur = Math.max(0.0001, sec);
    return new Promise((resolve) => (f.resolve = resolve));
  },

  update(dt) {
    this.time += dt;
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.resolve();
      }
    }
    const f = this.fadeState;
    if (f.resolve) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      f.a = f.from + (f.to - f.from) * k;
      if (k >= 1) {
        const r = f.resolve;
        f.resolve = null;
        r();
      }
    }
    const list = this.stack.slice();
    const top = this.top();
    for (let i = list.length - 1; i >= 0; i--) {
      const s = list[i];
      if (!this.stack.includes(s)) continue;
      s.update(dt, s === top);
      if (s.blocksUpdate) break;
    }
  },

  render() {
    let start = this.stack.length - 1;
    while (start > 0 && !this.stack[start].opaque) start--;
    const shown = this.stack.slice(Math.max(0, start));
    // The screen fade covers the game, but not a scene that asks to sit above it. A
    // full-screen card is its own blackout and brings its own words: drawn under the
    // fade it is a black screen with nothing on it, which is what the intro used to be.
    for (const s of shown) if (!s.aboveFade) s.render();
    if (this.fadeState.a > 0.001) R.fill(this.fadeState.color, this.fadeState.a);
    for (const s of shown) if (s.aboveFade) s.render();
  },
};
