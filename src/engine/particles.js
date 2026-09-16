// A small pooled particle system. Particles are squares in palette colours, or anything
// with its own draw(p, ox, oy) function.
import { R } from './gfx.js';

export class Particles {
  constructor(max = 160) {
    this.max = max;
    this.list = [];
  }

  // p: { x, y, vx, vy, ax, ay, drag, life, size, color, fade, draw }
  add(p) {
    if (this.list.length >= this.max) this.list.shift();
    this.list.push({ vx: 0, vy: 0, ax: 0, ay: 0, drag: 0, size: 1, fade: true, t: 0, life: 1, ...p });
  }

  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) {
        this.list.splice(i, 1);
        continue;
      }
      p.vx += p.ax * dt;
      p.vy += p.ay * dt;
      if (p.drag) {
        const k = Math.exp(-p.drag * dt);
        p.vx *= k;
        p.vy *= k;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  // ox, oy: camera offset (subtracted from positions).
  render(ox = 0, oy = 0) {
    for (const p of this.list) {
      if (p.draw) {
        p.draw(p, ox, oy);
        continue;
      }
      const a = p.fade ? 1 - p.t / p.life : 1;
      const s = typeof p.size === 'function' ? p.size(p) : p.size;
      R.rect(Math.round(p.x - ox - s / 2), Math.round(p.y - oy - s / 2), s, s, p.color, a);
    }
  }

  clear() {
    this.list.length = 0;
  }
}
