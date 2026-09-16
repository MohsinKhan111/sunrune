// Ambient life (F7): the things that keep moving when the player isn't doing anything.
// None of it is solid, none of it can be interacted with, and the whole lot is capped so
// it can never crowd the screen. Grass tufts and the Gate's sparkle are handled already -
// the tufts in the overworld's sway pass, the Gate in GatePortal.
import { R } from '../engine/gfx.js';
import { C } from '../engine/palette.js';
import { VW, VH } from '../engine/screen.js';
import { rng } from '../engine/rng.js';

const TILE = 16;

// What lives where. Counts are chosen to stay well under ~60 moving things at once.
const SCENES = {
  dunmere: { weeds: 2, flies: 6, streaks: 10 },
  canyon: { weeds: 2, flies: 3, streaks: 26 },
  hollow: { motes: 14, drips: true },
};

export class Ambient {
  constructor() {
    this.weeds = [];
    this.flies = [];
    this.streaks = [];
    this.motes = [];
    this.drips = [];
    this.patches = [];
    this.scene = {};
    this.t = 0;
    this.dripIn = 2;
  }

  // The original map characters, which say what kind of ground a tile is.
  groundAt(world, tx, ty) {
    return world.built?.def?.ground?.[ty]?.[tx] ?? null;
  }

  isSand(world, tx, ty) {
    const ch = this.groundAt(world, tx, ty);
    return ch === '.' || ch === 'x';
  }

  // Buildings are painted over ordinary sand tiles, so the ground character under a roof
  // is still sand. The solid map is what actually knows where the walls are.
  solidAt(world, px, py) {
    const b = world.built;
    if (!b) return false;
    const tx = Math.floor(px / TILE);
    const ty = Math.floor(py / TILE);
    if (tx < 0 || ty < 0 || tx >= b.w || ty >= b.h) return true;
    return b.solid[ty * b.w + tx] === 1;
  }

  // Called on every map load: everything here belongs to the map that is on screen.
  reset(world) {
    this.weeds = [];
    this.flies = [];
    this.streaks = [];
    this.motes = [];
    this.drips = [];
    this.patches = [];
    this.t = 0;
    this.scene = SCENES[world.mapId] ?? {};

    // Butterflies gather at the purple and teal ground patches.
    const rows = world.built?.def?.ground ?? [];
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const ch = rows[y][x];
        if (ch === 'p' || ch === 't') this.patches.push({ x, y, ch });
      }
    }

    for (let i = 0; i < (this.scene.flies ?? 0); i++) this.addFly(world);
    for (let i = 0; i < (this.scene.motes ?? 0); i++) {
      this.motes.push({
        x: rng() * world.built.w * TILE,
        y: rng() * world.built.h * TILE,
        phase: rng() * Math.PI * 2,
        speed: 4 + rng() * 6,
        teal: rng() < 0.5,
      });
    }
  }

  addFly(world) {
    if (!this.patches.length) return;
    const spot = this.patches[Math.floor(rng() * this.patches.length)];
    this.flies.push({
      hx: spot.x * TILE + 8,
      hy: spot.y * TILE + 8,
      phase: rng() * Math.PI * 2,
      speed: 0.8 + rng() * 0.8,
      radius: 6 + rng() * 10,
      rise: rng() * 6,
      purple: spot.ch === 'p',
      x: 0,
      y: 0,
    });
  }

  // Tumbleweeds come in on a gust from whichever side the wind is blowing.
  addWeed(world) {
    const cam = world.camera;
    const fromLeft = rng() < 0.5;
    const x = (cam.x ?? 0) + (fromLeft ? -12 : VW + 12);
    const tx = Math.floor(x / TILE);
    // Find a sandy row near the camera to roll along.
    const top = Math.floor((cam.y ?? 0) / TILE);
    const candidates = [];
    for (let ty = top; ty < top + Math.ceil(VH / TILE); ty++) {
      if (this.isSand(world, tx, ty)) candidates.push(ty);
    }
    if (!candidates.length) return;
    const ty = candidates[Math.floor(rng() * candidates.length)];
    this.weeds.push({
      x,
      y: ty * TILE + 8 + rng() * 6,
      vx: (fromLeft ? 1 : -1) * (26 + rng() * 26),
      hop: rng() * Math.PI * 2,
      spin: rng() * Math.PI * 2,
      size: rng() < 0.4 ? 5 : 6,
    });
  }

  addStreak(world) {
    const cam = world.camera;
    // Find open ground first. Spawning anywhere and skipping the draw left most of them
    // alive but invisible inside mesas and buildings, holding the cap full.
    for (let tries = 0; tries < 6; tries++) {
      const x = (cam.x ?? 0) - 20 + rng() * (VW + 40);
      const y = (cam.y ?? 0) + rng() * VH;
      if (this.solidAt(world, x, y)) continue;
      this.streaks.push({
        x,
        y,
        vx: 24 + rng() * 34,
        len: 4 + Math.floor(rng() * 5),
        life: 1.4 + rng() * 1.6,
        t: 0,
        pale: rng() < 0.5,
      });
      return;
    }
  }

  update(dt, world) {
    this.t += dt;

    // Tumbleweeds: one or two at a time, rolling and bouncing.
    // Tried often, because a town is full of walls and most attempts come to nothing.
    if (this.scene.weeds && this.weeds.length < this.scene.weeds && rng() < dt * 1.2) {
      this.addWeed(world);
    }
    for (let i = this.weeds.length - 1; i >= 0; i--) {
      const w = this.weeds[i];
      w.x += w.vx * dt;
      w.hop += dt * 7;
      w.spin += dt * (w.vx > 0 ? 5 : -5);
      const cam = world.camera;
      // Drop it once it rolls out of view or into a wall. Skipping the draw instead left
      // a weed alive but invisible for its whole life, holding the slot open.
      const gone =
        w.x < (cam.x ?? 0) - 40 || w.x > (cam.x ?? 0) + VW + 40 || this.solidAt(world, w.x, w.y);
      if (gone) this.weeds.splice(i, 1);
    }

    for (const f of this.flies) {
      f.phase += dt * f.speed;
      f.x = f.hx + Math.cos(f.phase) * f.radius;
      f.y = f.hy + Math.sin(f.phase * 1.6) * (f.radius * 0.5) - f.rise;
    }

    // Sand streaks, stronger in the canyon.
    if (this.scene.streaks && this.streaks.length < this.scene.streaks && rng() < dt * 14) {
      this.addStreak(world);
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += Math.sin(this.t * 2 + s.y) * 3 * dt;
      if (s.t >= s.life || this.solidAt(world, s.x, s.y)) this.streaks.splice(i, 1);
    }

    for (const m of this.motes) {
      m.phase += dt;
      m.y -= m.speed * dt;
      m.x += Math.sin(m.phase * 0.8) * 4 * dt;
      if (m.y < 0) m.y = world.built.h * TILE;
    }

    // Drips in the Hollow: a drop falls, then leaves a ring behind.
    if (this.scene.drips) {
      this.dripIn -= dt;
      if (this.dripIn <= 0) {
        this.dripIn = 1.5 + rng() * 3;
        const cam = world.camera;
        this.drips.push({
          x: (cam.x ?? 0) + 20 + rng() * (VW - 40),
          y: (cam.y ?? 0) + 10 + rng() * (VH - 60),
          fall: 0,
          to: 20 + rng() * 30,
          t: 0,
        });
      }
      for (let i = this.drips.length - 1; i >= 0; i--) {
        const d = this.drips[i];
        d.t += dt;
        d.fall = Math.min(d.to, d.fall + 90 * dt);
        if (d.t > 2.2) this.drips.splice(i, 1);
      }
    }
  }

  // Below the characters: things on the ground, so Pip walks in front of them.
  renderBelow(world, ox, oy) {
    for (const w of this.weeds) {
      const x = Math.round(w.x - ox);
      const bounce = Math.abs(Math.sin(w.hop)) * 5;
      const y = Math.round(w.y - oy - bounce);
      if (x < -12 || x > VW + 12) continue;
      R.ellipse(x, Math.round(w.y - oy) + 3, w.size * 2.2, 3, C.ink, 0.22);
      this.drawWeed(x, y, w);
    }
    for (const d of this.drips) {
      const x = Math.round(d.x - ox);
      const y = Math.round(d.y - oy + d.fall);
      if (x < 0 || x > VW) continue;
      if (d.fall < d.to) R.rect(x, y, 1, 2, C.mint, 0.7);
      else {
        const k = Math.min(1, (d.t - 0.3) * 2);
        R.ellipse(x, y, 2 + k * 7, 1 + k * 3, C.teal, 0.35 * (1 - k));
      }
    }
  }

  // A ring of dry twigs: a few pixels on a circle, turning as it rolls.
  drawWeed(x, y, w) {
    for (let i = 0; i < 7; i++) {
      const a = w.spin + (i / 7) * Math.PI * 2;
      const r = w.size;
      // Dark twigs: pale ones on pale sand were there in the counts and nowhere on screen.
      R.rect(Math.round(x + Math.cos(a) * r), Math.round(y + Math.sin(a) * r), 1, 1, C.ink);
      R.rect(
        Math.round(x + Math.cos(a + 0.5) * (r * 0.55)),
        Math.round(y + Math.sin(a + 0.5) * (r * 0.55)),
        1,
        1,
        C.rust,
      );
    }
  }

  // Above the characters: things in the air.
  renderAbove(world, ox, oy) {
    for (const s of this.streaks) {
      const x = Math.round(s.x - ox);
      const y = Math.round(s.y - oy);
      if (x < -8 || x > VW + 8 || y < 0 || y > VH) continue;
      const fade = Math.min(1, s.t / 0.3) * Math.min(1, (s.life - s.t) / 0.4);
      // Darker than the sand it blows across. Cream and sand on sand-coloured ground
      // measured fine and showed nothing at all.
      R.rect(x, y, s.len, 1, s.pale ? C.clay : C.rust, 0.85 * fade);
    }

    for (const f of this.flies) {
      const x = Math.round(f.x - ox);
      const y = Math.round(f.y - oy);
      if (x < -4 || x > VW + 4 || y < -4 || y > VH + 4) continue;
      // Wings open and shut as it goes.
      const open = Math.sin(f.phase * 9) > 0;
      // A dark body with bright wings, so they read on both the purple and the teal
      // patches. Colouring them to match the patch they gather on hid them completely.
      const wing = f.purple ? C.butter : C.white;
      R.rect(x, y, 1, 1, C.ink);
      R.rect(x - 1, y - (open ? 1 : 0), 1, 1, wing);
      R.rect(x + 1, y - (open ? 1 : 0), 1, 1, wing);
    }

    for (const m of this.motes) {
      const x = Math.round(m.x - ox);
      const y = Math.round(m.y - oy);
      if (x < 0 || x > VW || y < 0 || y > VH) continue;
      const glow = 0.5 + 0.35 * Math.sin(m.phase * 2);
      R.rect(x, y, 1, 1, m.teal ? C.teal : C.mint, glow);
    }

    // Fireflies, only on the night of the theft.
    if (world.state?.flags?.intro_running) this.renderFireflies(ox, oy);
  }

  renderFireflies(ox, oy) {
    for (let i = 0; i < 12; i++) {
      const t = this.t * 0.35 + i * 1.7;
      const x = Math.round(((Math.sin(t * 1.3 + i) * 0.5 + 0.5) * (VW + 40)) - 20);
      const y = Math.round(((Math.cos(t * 0.9 + i * 2.1) * 0.5 + 0.5) * (VH - 40)) + 20);
      const blink = Math.sin(this.t * 3 + i * 2) * 0.5 + 0.5;
      if (blink < 0.35) continue;
      R.rect(x, y, 1, 1, i % 3 === 0 ? C.butter : C.gold, blink);
    }
  }
}
