// Things in the world besides the player: townsfolk, chests, Post Terminals, props,
// the Gate's portal, pickups.
import { Actor } from './entity.js';
import { R } from '../engine/gfx.js';
import { C } from '../engine/palette.js';
import { art, enemySheet, enemyWhite } from '../engine/sheets.js';
import { rng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { ENEMIES } from '../data/enemies.js';
import { CHEST, TERMINAL, PORTAL, PAD } from '../data/tiles.js';

export const TILE = 16;

// Tile coordinates → feet position in pixels (bottom middle of the tile).
export function tileToFeet(tx, ty) {
  return { x: tx * TILE + 8, y: ty * TILE + 14 };
}

export class Npc extends Actor {
  constructor(def) {
    const p = tileToFeet(def.x, def.y);
    super({ id: def.id, char: def.char ?? def.id, x: p.x, y: p.y, facing: def.facing ?? 'down' });
    this.def = def;
    this.behavior = def.behavior ?? 'stand';
    this.home = { x: p.x, y: p.y };
    this.radius = (def.radius ?? 1.5) * TILE;
    this.timer = 1 + rng() * 2;
    this.goal = null;
    this.stuck = 0;
    this.talking = false;
    this.scripted = false;
    this.speed = def.speed ?? 28;
    this.talk = def.talk ?? def.id;
  }

  think(dt, world) {
    if (this.talking || this.scripted) return;
    if (this.behavior === 'wander') {
      if (this.goal) {
        const dx = this.goal.x - this.x;
        const dy = this.goal.y - this.y;
        const d = Math.hypot(dx, dy);
        if (d < 1) {
          this.goal = null;
          this.moving = false;
          this.timer = 1 + rng() * 2;
          return;
        }
        const step = Math.min(d, this.speed * dt);
        const moved = world.moveActor(this, (dx / d) * step, (dy / d) * step);
        this.vx = (dx / d) * this.speed;
        this.vy = (dy / d) * this.speed;
        this.moving = true;
        if (Math.abs(dx) > 1) this.turn(dx < 0);
        this.stuck = moved < step * 0.3 ? this.stuck + dt : 0;
        if (this.stuck > 0.4) {
          this.goal = null;
          this.moving = false;
          this.timer = 0.6 + rng();
        }
      } else {
        this.moving = false;
        this.vx = 0;
        this.vy = 0;
        this.timer -= dt;
        if (this.timer <= 0) {
          const a = rng() * Math.PI * 2;
          const r = rng() * this.radius;
          this.goal = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r * 0.7 };
        }
      }
    } else if (this.behavior === 'stand') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.turn(!this.flip);
        this.timer = 2 + rng() * 3;
      }
    }
  }
}

// An enemy walking the map (F13). It roams near home, notices Pip, chases, and gives up.
// Touching it starts a battle; touching it from behind while it roams is a first strike.
export class EnemyWalker extends Actor {
  constructor(def) {
    const p = tileToFeet(def.x, def.y);
    super({ id: def.id, char: null, x: p.x, y: p.y, facing: 'left' });
    const data = ENEMIES[def.kind];
    this.def = def;
    this.kind = def.kind;
    this.data = data;
    this.group = def.group ?? [def.kind];
    this.sheets = { normal: enemySheet[data.sprite], blink: enemySheet[data.sprite], white: enemyWhite[data.sprite] };
    this.flip = true;
    this.solid = false;
    this.w = 12;
    this.h = 8;
    this.home = { x: p.x, y: p.y };
    this.radius = (def.radius ?? 2) * TILE;
    this.speed = def.speed ?? 28;
    this.chaseSpeed = data.flies ? 70 : 62;
    this.mode = def.still ? 'still' : 'roam';
    this.timer = rng() * 2;
    this.goal = null;
    this.cooldown = 0;
    this.stuck = 0;
  }

  think(dt, world) {
    if (this.cooldown > 0) this.cooldown -= dt;
    const p = world.player;
    const d = Math.hypot(p.x - this.x, p.y - this.y);
    if (this.mode !== 'still') {
      if (this.mode !== 'chase' && this.cooldown <= 0 && d < 80 && world.canSee(this, p)) {
        this.mode = 'chase';
        this.showEmote('!', 0.9);
        audio.sfx('alert');
      } else if (this.mode === 'chase' && (d > 144 || this.cooldown > 0)) {
        this.mode = 'return';
      }
    }
    let tx = null;
    let ty = null;
    let speed = this.speed;
    if (this.mode === 'chase') {
      tx = p.x;
      ty = p.y;
      speed = this.chaseSpeed;
    } else if (this.mode === 'return') {
      tx = this.home.x;
      ty = this.home.y;
      if (Math.hypot(tx - this.x, ty - this.y) < 4) {
        this.mode = 'roam';
        tx = null;
      }
    } else if (this.mode === 'roam') {
      if (this.goal) {
        tx = this.goal.x;
        ty = this.goal.y;
        if (Math.hypot(tx - this.x, ty - this.y) < 2) {
          this.goal = null;
          tx = null;
          this.timer = 0.8 + rng() * 2;
        }
      } else {
        this.timer -= dt;
        if (this.timer <= 0) {
          const a = rng() * Math.PI * 2;
          const r = rng() * this.radius;
          this.goal = { x: this.home.x + Math.cos(a) * r, y: this.home.y + Math.sin(a) * r * 0.7 };
        }
      }
    }
    if (tx === null) {
      this.moving = false;
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = Math.min(dist, speed * dt);
    const moved = world.moveActor(this, (dx / dist) * step, (dy / dist) * step);
    this.vx = (dx / dist) * speed;
    this.vy = (dy / dist) * speed;
    this.moving = moved > 0.02;
    if (Math.abs(dx) > 1) this.turn(dx < 0);
    this.stuck = moved < step * 0.3 ? this.stuck + dt : 0;
    if (this.stuck > 0.5 && this.mode === 'roam') {
      this.goal = null;
      this.stuck = 0;
    }
  }
}

// Biscuit walking behind Pip (F14). He follows her trail rather than her position, so he
// takes the same route round corners. He isn't solid and triggers nothing.
export class Follower extends Actor {
  constructor(char, id) {
    super({ id, char });
    this.trail = [];
    this.gap = 18;
    this.solid = false;
  }

  placeBehind(leader) {
    this.trail.length = 0;
    this.x = leader.x - (leader.flip ? -14 : 14);
    this.y = leader.y;
    this.flip = leader.flip;
    this.facing = leader.facing;
    this.moving = false;
  }

  follow(dt, world) {
    const leader = world.player;
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(leader.x - last.x, leader.y - last.y) > 1.5) this.trail.push({ x: leader.x, y: leader.y });
    if (this.trail.length > 160) this.trail.shift();
    let dist = 0;
    let target = null;
    for (let i = this.trail.length - 1; i > 0; i--) {
      dist += Math.hypot(this.trail[i].x - this.trail[i - 1].x, this.trail[i].y - this.trail[i - 1].y);
      if (dist >= this.gap) {
        target = this.trail[i - 1];
        break;
      }
    }
    if (!target) {
      this.moving = false;
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const dx = target.x - this.x;
    const dy = target.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) {
      this.moving = false;
      this.vx = 0;
      this.vy = 0;
      return;
    }
    const speed = Math.min(170, Math.max(60, d * 7));
    const step = Math.min(d, speed * dt);
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    this.vx = (dx / d) * speed;
    this.vy = (dy / d) * speed;
    this.moving = true;
    this.running = leader.running;
    if (Math.abs(dx) > 1) this.turn(dx < 0);
  }
}

export class Chest {
  constructor(def, open) {
    this.def = def;
    this.id = def.id;
    this.x = def.x * TILE;
    this.y = def.y * TILE;
    this.open = open;
    this.sortY = this.y + 14;
    this.solidBox = { x: this.x + 1, y: this.y + 4, w: 14, h: 11 };
    this.hit = { x: this.x, y: this.y, w: 16, h: 16 };
    this.popT = 0;
  }

  update(dt) {
    if (this.popT > 0) this.popT -= dt;
  }

  draw(ox, oy) {
    const set = CHEST[this.def.color ?? 'orange'];
    const lift = this.popT > 0 ? Math.round(Math.sin((this.popT / 0.25) * Math.PI) * 2) : 0;
    R.tile(set[this.open ? 1 : 0], this.x - ox, this.y - oy - lift);
  }
}

export class Terminal {
  constructor(def) {
    this.def = def;
    this.x = def.x * TILE;
    this.y = def.y * TILE;
    this.sortY = this.y + 14;
    this.solidBox = { x: this.x + 1, y: this.y + 3, w: 14, h: 12 };
    this.hit = { x: this.x, y: this.y, w: 16, h: 16 };
    this.t = rng() * 3;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ox, oy) {
    R.tile(TERMINAL, this.x - ox, this.y - oy);
    const on = Math.floor(this.t * 1.5) % 2 === 0;
    R.rect(this.x + 5 - ox, this.y + 5 - oy, 6, 3, on ? C.mint : C.teal);
    if (on) R.rect(this.x + 5 - ox, this.y + 5 - oy, 2, 1, C.white);
  }
}

// Something in the way until the story clears it: a locked gate, a blocked path.
// Draws a tile across its area with an optional prop on top (a padlock).
export class Blocker {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.x = def.x * TILE;
    this.y = def.y * TILE;
    this.w = (def.w ?? 1) * TILE;
    this.h = (def.h ?? 1) * TILE;
    this.sortY = this.y + this.h - 2;
    this.solidBox = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.hit = { x: this.x, y: this.y, w: this.w, h: this.h };
    this.pic = def.art ? art[def.art] : null;
  }

  update() {}

  draw(ox, oy) {
    if (this.def.tiles) {
      this.def.tiles.forEach((row, ty) => row.forEach((t, tx) => R.tile(t, this.x + tx * TILE - ox, this.y + ty * TILE - oy)));
    } else {
      for (let tx = 0; tx < this.w / TILE; tx++) {
        for (let ty = 0; ty < this.h / TILE; ty++) R.tile(this.def.tile, this.x + tx * TILE - ox, this.y + ty * TILE - oy);
      }
    }
    if (this.pic) R.pic(this.pic, this.x + this.w / 2 - this.pic.width / 2 - ox, this.y + this.h / 2 - this.pic.height / 2 - oy);
  }
}

// A rune pad on the floor of the Hollow. Lights up when stepped on in the right order,
// flashes red when the order is wrong (F16).
export class Pad {
  constructor(def) {
    this.def = def;
    this.id = def.id;
    this.x = def.x * TILE;
    this.y = def.y * TILE;
    this.lit = false;
    this.wrong = 0;
    this.t = 0;
    this.flat = true;
    this.glyph = art[def.glyph];
  }

  update(dt) {
    this.t += dt;
    if (this.wrong > 0) this.wrong -= dt;
  }

  draw(ox, oy) {
    PAD.forEach((row, ry) => row.forEach((t, rx) => R.tile(t, this.x + rx * TILE - ox, this.y + ry * TILE - oy)));
    const cx = this.x + TILE - ox;
    const cy = this.y + TILE - oy;
    if (this.lit) R.ellipse(cx, cy, 44, 36, C.gold, 0.16 + Math.sin(this.t * 3) * 0.06);
    if (this.wrong > 0) R.ellipse(cx, cy, 44, 36, C.red, 0.4 * Math.min(1, this.wrong));
    if (this.glyph) R.pic(this.glyph, cx - this.glyph.width / 2, cy - this.glyph.height / 2, { alpha: this.lit ? 1 : 0.65 });
  }
}

// A custom prop (bed, table, rug...). flat props lie on the ground; over props are
// drawn above whoever stands in them (the blanket over someone in bed).
export class Deco {
  constructor(def) {
    this.def = def;
    this.id = def.id ?? null;
    this.pic = art[def.art];
    this.x = def.x * TILE;
    this.y = def.y * TILE;
    this.flat = !!def.flat;
    this.visible = true;
    this.sortY = def.over ? this.y + 40 : this.y + this.pic.height - 2;
    if (def.solid) {
      const b = def.box ?? [0, 0, this.pic.width, this.pic.height];
      this.solidBox = { x: this.x + b[0], y: this.y + b[1], w: b[2], h: b[3] };
    }
  }

  update() {}

  draw(ox, oy) {
    if (this.visible) R.pic(this.pic, this.x - ox, this.y - oy);
  }
}

// Something small to pick up, drawn at a pixel offset (the satchel on the table).
export class Pickup {
  constructor(def, taken) {
    this.def = def;
    this.id = def.id;
    this.pic = art[def.art];
    this.x = def.x * TILE + (def.dx ?? 0);
    this.y = def.y * TILE + (def.dy ?? 0);
    this.taken = taken;
    this.sortY = def.y * TILE + 12;
    this.hit = { x: def.x * TILE, y: def.y * TILE, w: 16, h: 16 };
    this.t = 0;
  }

  update(dt) {
    this.t += dt;
  }

  draw(ox, oy) {
    if (this.taken) return;
    R.pic(this.pic, this.x - ox, this.y - oy);
  }
}

// The Gate's portal, silent or humming.
export class GatePortal {
  constructor(def, active) {
    this.def = def;
    this.id = def.id;
    this.cx = (def.x + 1) * TILE + 8;
    this.cy = (def.y + 1) * TILE + 8;
    this.active = active;
    this.sortY = (def.y + 2) * TILE + 15;
    this.t = 0;
    this.burst = 0;
  }

  update(dt, world) {
    this.t += dt;
    if (this.burst > 0) this.burst -= dt;
    if (this.active && rng() < dt * 6) {
      world.particles.add({
        x: this.cx + (rng() * 12 - 6),
        y: this.cy + 4,
        vy: -12 - rng() * 10,
        vx: rng() * 4 - 2,
        life: 1 + rng() * 0.8,
        size: rng() < 0.3 ? 2 : 1,
        color: rng() < 0.5 ? C.lilac : C.white,
      });
    }
  }

  draw(ox, oy) {
    const x = this.cx - 8 - ox;
    const y = this.cy - 8 - oy;
    if (this.active) {
      const pulse = 0.5 + 0.5 * Math.sin(this.t * 3);
      R.ellipse(this.cx - ox, this.cy - oy, 26 + pulse * 4, 22 + pulse * 4, C.lilac, 0.18 + (this.burst > 0 ? 0.4 : 0));
      R.ellipse(this.cx - ox, this.cy - oy, 16, 14, C.lilac, 0.35);
      R.tile(PORTAL, x, y, { flip: Math.floor(this.t * 5) % 2 === 1 });
    } else {
      R.tile(PORTAL, x, y, { alpha: 0.35 });
      R.ellipse(this.cx - ox, this.cy - oy, 10, 10, C.ink, 0.5);
    }
  }
}
