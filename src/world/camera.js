// Smooth follow camera with look-ahead, pans for cutscenes, and shake.
import { VW, VH } from '../engine/screen.js';
import { damp, clamp, ease } from '../engine/ease.js';
import { rng } from '../engine/rng.js';
import { G } from '../game.js';

export class Camera {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.target = null;
    this.leadX = 0;
    this.leadY = 0;
    this.pan = null;
    this.shakeT = 0;
    this.shakeDur = 1;
    this.shakeA = 0;
    this.ox = 0;
    this.oy = 0;
    this.w = VW;
    this.h = VH;
  }

  setBounds(w, h) {
    this.w = w;
    this.h = h;
  }

  goal() {
    const t = this.target;
    return { x: t.x + this.leadX - VW / 2, y: t.y - 14 + this.leadY - VH / 2 };
  }

  follow(actor, snap = false) {
    this.target = actor;
    this.pan = null;
    if (snap && actor) {
      this.leadX = 0;
      this.leadY = 0;
      const g = this.goal();
      this.x = g.x;
      this.y = g.y;
      this.clamp();
    }
  }

  // Pan so (x, y) is centred. Resolves when it arrives.
  panTo(x, y, sec) {
    this.target = null;
    return new Promise((resolve) => {
      this.pan = { fx: this.x, fy: this.y, tx: x - VW / 2, ty: y - VH / 2, t: 0, dur: Math.max(0.01, sec), resolve };
    });
  }

  shake(amount, sec = 0.3) {
    if (G.settings && !G.settings.shake) return;
    this.shakeA = amount;
    this.shakeT = sec;
    this.shakeDur = sec;
  }

  clamp() {
    this.x = this.w <= VW ? (this.w - VW) / 2 : clamp(this.x, 0, this.w - VW);
    this.y = this.h <= VH ? (this.h - VH) / 2 : clamp(this.y, 0, this.h - VH);
  }

  update(dt) {
    if (this.pan) {
      const p = this.pan;
      p.t += dt;
      const k = ease.inOutSine(Math.min(1, p.t / p.dur));
      this.x = p.fx + (p.tx - p.fx) * k;
      this.y = p.fy + (p.ty - p.fy) * k;
      if (p.t >= p.dur) {
        this.pan = null;
        p.resolve();
      }
    } else if (this.target) {
      const t = this.target;
      const lx = t.vx > 5 ? 16 : t.vx < -5 ? -16 : 0;
      const ly = t.vy > 5 ? 10 : t.vy < -5 ? -10 : 0;
      this.leadX = damp(this.leadX, lx, 0.4, dt);
      this.leadY = damp(this.leadY, ly, 0.4, dt);
      const g = this.goal();
      this.x = damp(this.x, g.x, 0.12, dt);
      this.y = damp(this.y, g.y, 0.12, dt);
    }
    this.clamp();
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeA * Math.max(0, this.shakeT / this.shakeDur);
      this.ox = (rng() * 2 - 1) * a;
      this.oy = (rng() * 2 - 1) * a;
    } else {
      this.ox = 0;
      this.oy = 0;
    }
  }

  get cx() {
    return this.x + this.ox;
  }

  get cy() {
    return this.y + this.oy;
  }
}
