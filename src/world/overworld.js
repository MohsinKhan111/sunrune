// The overworld scene: the map, everyone in it, the camera, doors, interaction (F5-F7).
import { G } from '../game.js';
import { R, sheets, makeCanvas } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text, bigText, bigWidth, textWidth } from '../engine/font.js';
import { Particles } from '../engine/particles.js';
import { clamp, ease, approach } from '../engine/ease.js';
import { rng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { MAPS } from './maps/index.js';
import { buildMap, renderGround, TILE } from './map.js';
import { Camera } from './camera.js';
import { Ambient } from './ambient.js';
import { Lighting } from './lighting.js';
import { Actor } from './entity.js';
import { Npc, Chest, Terminal, Deco, GatePortal, Pickup, EnemyWalker, Follower, Blocker, Pad, tileToFeet } from './actors.js';
import { runScript } from '../story/script.js';
import { flag, setFlag, restoreParty } from '../story/state.js';
import { startBattle } from '../battle/battle.js';
import * as story from '../story/chapter1.js';

const WALK = 72;
const RUN = 120;
const ACCEL = 0.08;
const DECEL = 0.06;
const NUDGE = 4;

const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

export class Overworld {
  constructor() {
    this.opaque = true;
    this.busy = 0;
    this.camera = new Camera();
    this.particles = new Particles(220);
    this.ambient = new Ambient();
    this.lighting = new Lighting();
    this.player = new Actor({ id: 'pip', char: 'pip' });
    this.player.onStep = (a) => this.onStep(a);
    this.follower = null;
    this.actors = [];
    this.objects = [];
    this.triggers = [];
    this.interactables = [];
    this.counters = [];
    this.cache = {};
    this.banner = null;
    this.toasts = [];
    this.bars = 0;
    this.barsOn = false;
    this.time = 0;
    this.transitioning = false;
    this.triggerLock = true;
    this.target = null;
    this.tint = null;
  }

  // A colour wash over the world (night, sunset). UI stays untinted.
  setTint(color, alpha) {
    this.tint = color ? { color, alpha } : null;
  }

  get state() {
    return G.state;
  }

  // ---- map loading ----

  load(mapId, spawnName, pos) {
    const def = MAPS[mapId];
    if (!def) throw new Error(`no map ${mapId}`);
    let c = this.cache[mapId];
    if (!c) {
      const built = buildMap(def);
      c = this.cache[mapId] = { built, canvas: renderGround(built, sheets.tiles, makeCanvas) };
    }
    this.def = def;
    this.built = c.built;
    this.ground = c.canvas;
    this.mapId = mapId;
    this.camera.setBounds(this.built.w * TILE, this.built.h * TILE);
    const p = this.player;
    if (pos) {
      p.x = pos.x;
      p.y = pos.y;
      if (pos.facing) p.face(pos.facing);
    } else {
      const s = def.spawns[spawnName] ?? Object.values(def.spawns)[0];
      const f = tileToFeet(s.x, s.y);
      p.x = f.x;
      p.y = f.y;
      p.face(s.facing);
      p.facing = s.facing;
    }
    p.vx = 0;
    p.vy = 0;
    p.moving = false;
    this.buildObjects();
    this.follower?.placeBehind?.(p);
    this.camera.follow(p, true);
    this.particles.clear();
    this.ambient.reset(this);
    this.triggerLock = true;
    G.state.map = mapId;
    audio.music(def.music);
    audio.ambient(def.ambient);
  }

  buildObjects() {
    const st = this.state;
    const def = this.def;
    if (flag(st, 'biscuit_joined') && !this.follower) this.follower = new Follower('biscuit', 'biscuit');
    this.actors = [this.player];
    if (this.follower) {
      this.actors.push(this.follower);
      this.follower.placeBehind(this.player);
    }
    this.objects = [];
    this.triggers = [];
    this.interactables = [];
    this.counters = (def.counters ?? []).map((c) => ({ x: c.x * TILE, y: c.y * TILE, w: c.w * TILE, h: c.h * TILE }));
    for (const o of def.objects ?? []) {
      if (o.type === 'chest') {
        const ch = new Chest(o, flag(st, `chest:${o.id}`));
        this.objects.push(ch);
        this.interactables.push({ box: ch.hit, kind: 'chest', target: ch });
      } else if (o.type === 'terminal') {
        const t = new Terminal(o);
        this.objects.push(t);
        this.interactables.push({ box: t.hit, kind: 'terminal', target: t });
      } else if (o.type === 'deco') {
        this.objects.push(new Deco(o));
      } else if (o.type === 'pickup') {
        const pk = new Pickup(o, flag(st, `took:${o.id}`));
        this.objects.push(pk);
        if (!pk.taken) this.interactables.push({ box: pk.hit, kind: 'pickup', target: pk, id: o.id });
      } else if (o.type === 'gate') {
        const g = new GatePortal(o, flag(st, 'gate_active') || flag(st, 'intro_running'));
        this.objects.push(g);
        this.gate = g;
        this.interactables.push({ box: { x: o.x * TILE, y: o.y * TILE, w: 48, h: 48 }, kind: 'gate', target: g, id: o.id });
      } else if (o.type === 'blocker') {
        if (flag(st, `unlocked:${o.id}`)) continue;
        const b = new Blocker(o);
        this.objects.push(b);
        this.interactables.push({ box: b.hit, kind: 'blocker', target: b, id: o.id });
      } else if (o.type === 'pad') {
        const p = new Pad(o);
        this.objects.push(p);
        this.triggers.push({ box: { x: p.x + 3, y: p.y + 3, w: 26, h: 26 }, kind: 'script', id: o.id });
      } else if (o.type === 'action') {
        this.interactables.push({
          box: { x: o.x * TILE, y: o.y * TILE, w: (o.w ?? 1) * TILE, h: (o.h ?? 1) * TILE },
          kind: 'action',
          id: o.id,
        });
      } else if (o.type === 'sign') {
        this.interactables.push({ box: { x: o.x * TILE, y: o.y * TILE, w: 16, h: 16 }, kind: 'sign', id: o.text });
      } else if (o.type === 'exit') {
        this.triggers.push({ box: { x: o.x * TILE, y: o.y * TILE, w: o.w * TILE, h: o.h * TILE }, kind: 'exit', to: o.to, spawn: o.spawn });
      } else if (o.type === 'trigger') {
        this.triggers.push({ box: { x: o.x * TILE, y: o.y * TILE, w: (o.w ?? 1) * TILE, h: (o.h ?? 1) * TILE }, kind: 'script', id: o.script });
      }
    }
    for (const d of this.built.doors) {
      if (d.to) this.triggers.push({ box: { x: d.x * TILE + 2, y: d.y * TILE + 9, w: d.w * TILE - 4, h: 7 }, kind: 'exit', to: d.to, spawn: d.spawn, door: true });
      else if (d.text) this.interactables.push({ box: { x: d.x * TILE, y: d.y * TILE, w: d.w * TILE, h: 16 }, kind: 'text', id: d.text });
    }
    for (const cv of this.built.caves) {
      this.triggers.push({ box: { x: cv.x * TILE + 2, y: cv.y * TILE + 9, w: cv.w * TILE - 4, h: 7 }, kind: 'exit', to: cv.to, spawn: cv.spawn, door: true });
    }
    for (const n of story.npcs(this.mapId, st)) this.spawnNpc(n);
    for (const e of story.enemies?.(this.mapId, st) ?? []) {
      if (flag(st, `calmed:${this.mapId}:${e.id}`)) continue;
      this.actors.push(new EnemyWalker(e));
    }
  }

  // Straight line between two actors with no wall in the way.
  canSee(a, b) {
    const steps = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8);
    for (let i = 1; i < steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      const tx = Math.floor(x / TILE);
      const ty = Math.floor(y / TILE);
      if (tx < 0 || ty < 0 || tx >= this.built.w || ty >= this.built.h) return false;
      if (this.built.solid[ty * this.built.w + tx]) return false;
    }
    return true;
  }

  // Runs a battle, handling "Try again" and defeat. Resolves with the result.
  async runBattle(group, opts = {}) {
    let result;
    do {
      result = await startBattle(this, { enemies: group, ...opts });
      if (result.load) {
        await story.onDefeat(this);
        return result;
      }
    } while (result.retry);
    return result;
  }

  async startEncounter(enemy) {
    if (this.busy > 0 || this.transitioning) return;
    this.busy++;
    try {
      if (enemy.def.script) {
        await runScript(this, (g) => story.encounter(g, enemy));
      } else {
        const behind = (enemy.flip && this.player.x > enemy.x) || (!enemy.flip && this.player.x < enemy.x);
        const result = await this.runBattle(enemy.group, {
          canRun: enemy.def.canRun !== false,
          firstStrike: enemy.mode === 'roam' && behind,
        });
        this.afterBattle(result, enemy);
      }
    } finally {
      this.busy = Math.max(0, this.busy - 1);
    }
  }

  afterBattle(result, enemy) {
    if (result.won) {
      setFlag(G.state, `calmed:${this.mapId}:${enemy.id}`);
      this.removeActor(enemy.id);
    } else if (result.ran) {
      enemy.cooldown = 3;
      enemy.mode = 'return';
      this.player.invulnT = 2;
    } else {
      this.player.invulnT = 2;
    }
  }

  addFollower(char) {
    this.follower = new Follower(char, char);
    this.follower.placeBehind(this.player);
    this.actors.push(this.follower);
    return this.follower;
  }

  spawnNpc(def) {
    const n = new Npc(def);
    this.actors.push(n);
    return n;
  }

  removeActor(id) {
    this.actors = this.actors.filter((a) => a.id !== id);
  }

  removeObject(id) {
    this.objects = this.objects.filter((o) => o.id !== id);
    this.interactables = this.interactables.filter((it) => it.id !== id);
    this.target = null;
  }

  find(id) {
    return id === 'pip' ? this.player : this.actors.find((a) => a.id === id) ?? this.objects.find((o) => o.id === id) ?? null;
  }

  // ---- collision ----

  blocked(ent, x, y) {
    const b = ent.box(x, y);
    const built = this.built;
    const x0 = Math.floor(b.x / TILE);
    const x1 = Math.floor((b.x + b.w - 0.001) / TILE);
    const y0 = Math.floor(b.y / TILE);
    const y1 = Math.floor((b.y + b.h - 0.001) / TILE);
    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        if (tx < 0 || ty < 0 || tx >= built.w || ty >= built.h) return true;
        if (built.solid[ty * built.w + tx]) return true;
      }
    }
    for (const r of built.rects) if (overlap(b, r)) return true;
    for (const o of this.objects) if (o.solidBox && overlap(b, o.solidBox)) return true;
    for (const a of this.actors) {
      if (a === ent || !a.solid || !a.visible || a === this.follower || ent === this.follower) continue;
      // Enemies walk into Pip on purpose: that touch is what starts a battle.
      if (a === this.player && ent instanceof EnemyWalker) continue;
      if (overlap(b, a.box())) return true;
    }
    return false;
  }

  // Moves with collision, one axis at a time. Returns the distance actually moved.
  moveActor(ent, dx, dy, nudge = false) {
    const sx = ent.x;
    const sy = ent.y;
    const stepAxis = (axis, d) => {
      const n = Math.ceil(Math.abs(d));
      const s = n ? d / n : 0;
      for (let i = 0; i < n; i++) {
        const nx = axis === 'x' ? ent.x + s : ent.x;
        const ny = axis === 'y' ? ent.y + s : ent.y;
        if (!this.blocked(ent, nx, ny)) {
          ent.x = nx;
          ent.y = ny;
          continue;
        }
        if (nudge) {
          // Slip around corners that overlap by a few pixels.
          for (let off = 1; off <= NUDGE; off++) {
            for (const sgn of [-1, 1]) {
              const px = axis === 'x' ? nx : ent.x + sgn * off;
              const py = axis === 'y' ? ny : ent.y + sgn * off;
              const ax = axis === 'x' ? ent.x : ent.x + sgn * off;
              const ay = axis === 'y' ? ent.y : ent.y + sgn * off;
              if (!this.blocked(ent, ax, ay) && !this.blocked(ent, px, py)) {
                if (axis === 'x') ent.y += sgn * Math.min(1, off);
                else ent.x += sgn * Math.min(1, off);
                return;
              }
            }
          }
        }
        return;
      }
    };
    if (dx) stepAxis('x', dx);
    if (dy) stepAxis('y', dy);
    return Math.hypot(ent.x - sx, ent.y - sy);
  }

  // ---- scripted movement ----

  scriptWalk(actor, tx, ty, { speed = 50, run = false } = {}) {
    if (!actor) return Promise.resolve();
    const goal = tileToFeet(tx, ty);
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        actor.walkTo = null;
        if (actor !== this.player) actor.scripted = false;
        resolve();
      };
      actor.scripted = true;
      actor.walkTo = { x: goal.x, y: goal.y, speed: run ? speed * 1.6 : speed, run, resolve: finish, t: 0 };
      // Safety net: a scene must never hang, even if the actor leaves the world.
      G.wait(7).then(finish);
    });
  }

  stepScripted(a, dt) {
    const w = a.walkTo;
    if (!w) return;
    w.t += dt;
    const dx = w.x - a.x;
    const dy = w.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.6 || w.t > 6) {
      a.x = w.x;
      a.y = w.y;
      a.walkTo = null;
      a.moving = false;
      a.running = false;
      a.vx = 0;
      a.vy = 0;
      if (a !== this.player) a.scripted = false;
      w.resolve();
      return;
    }
    const step = Math.min(d, w.speed * dt);
    a.x += (dx / d) * step;
    a.y += (dy / d) * step;
    a.vx = (dx / d) * w.speed;
    a.vy = (dy / d) * w.speed;
    a.moving = true;
    a.running = w.run;
    if (Math.abs(dx) > Math.abs(dy)) a.face(dx < 0 ? 'left' : 'right');
    else {
      a.facing = dy < 0 ? 'up' : 'down';
      if (Math.abs(dx) > 1) a.turn(dx < 0);
    }
  }

  // ---- updates ----

  canControl(isTop) {
    return isTop && this.busy === 0 && !this.transitioning;
  }

  update(dt, isTop) {
    this.time += dt;
    const p = this.player;
    if (this.canControl(isTop)) this.controlPlayer(dt);
    else if (!p.walkTo) {
      p.vx = approach(p.vx, 0, (WALK / DECEL) * dt);
      p.vy = approach(p.vy, 0, (WALK / DECEL) * dt);
      p.moving = false;
    }
    for (const a of this.actors) {
      if (a.walkTo) this.stepScripted(a, dt);
      else if (a.think) a.think(dt, this);
      a.update(dt);
    }
    this.follower?.follow?.(dt, this);
    for (const o of this.objects) o.update?.(dt, this);
    this.particles.update(dt);
    this.ambient.update(dt, this);
    this.camera.update(dt);
    this.bars = approach(this.bars, this.barsOn ? 1 : 0, dt / 0.3);
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > 3) this.banner = null;
    }
    for (const t of this.toasts) t.t += dt;
    this.toasts = this.toasts.filter((t) => t.t < 2.8);
    this.updateTarget();
    this.updateHum();
    if (this.busy === 0 && !this.transitioning) {
      this.checkTriggers();
      this.checkEncounters();
    }
  }

  // The Gate's hum (F19): only once it is lit, and louder the closer Pip stands. It
  // stays silent through the middle of the chapter, while the Gate is dark.
  updateHum() {
    const gate = this.objects.find((o) => o.id === 'dunmere_gate' && o.active);
    if (!gate) {
      audio.hum(0);
      return;
    }
    const d = Math.hypot((gate.x ?? 0) - this.player.x, (gate.y ?? 0) - this.player.y);
    const near = Number.isFinite(d) ? Math.max(0, Math.min(1, 1 - (d - 24) / 150)) : 0;
    audio.hum(0.3 + near * 0.7);
  }

  checkEncounters() {
    if (this.player.invulnT > 0) return;
    const b = this.player.box();
    for (const a of this.actors) {
      if (!(a instanceof EnemyWalker) || a.cooldown > 0) continue;
      if (overlap(b, a.box())) {
        this.startEncounter(a);
        return;
      }
    }
  }

  controlPlayer(dt) {
    const p = this.player;
    const d = input.dir();
    let ix = d.x;
    let iy = d.y;
    if (ix && iy) {
      ix *= Math.SQRT1_2;
      iy *= Math.SQRT1_2;
    }
    const run = input.held('run');
    const speed = run ? RUN : WALK;
    const has = ix !== 0 || iy !== 0;
    const accel = (speed / (has ? ACCEL : DECEL)) * dt;
    p.vx = approach(p.vx, ix * speed, accel);
    p.vy = approach(p.vy, iy * speed, accel);
    const wasMoving = p.moving;
    const moved = this.moveActor(p, p.vx * dt, p.vy * dt, !(ix && iy));
    if (moved < 0.01 && has) {
      p.vx *= 0.5;
      p.vy *= 0.5;
    }
    p.moving = has && moved > 0.05;
    p.running = run && p.moving;
    if (d.x) p.face(d.x < 0 ? 'left' : 'right');
    if (d.y && !d.x) p.facing = d.y < 0 ? 'up' : 'down';
    if (wasMoving && !has && Math.hypot(p.vx, p.vy) > 90) this.dust(p.x, p.y, 3);

    if (input.pressed('confirm') && this.target) {
      input.consume('confirm');
      this.interact(this.target);
    } else if (input.pressed('menu') || (input.pressed('cancel') && input.device !== 'touch')) {
      // X on the keyboard is a shortcut into the pause menu, since there is nothing else
      // to cancel out here. On the touch pad B is printed "Back" and has its own Menu
      // button beside it, so there it means back and nothing else (F40).
      story.openMenu?.(this);
    }
  }

  onStep(a) {
    if (a.running && a.frame === 1) this.dust(a.x, a.y, 2);
    if (a === this.player) audio.sfx('step', { volume: this.def.indoors ? 0.5 : 0.8 });
  }

  dust(x, y, n) {
    for (let i = 0; i < n; i++) {
      this.particles.add({
        x: x + (rng() * 8 - 4),
        y: y - 1,
        vx: rng() * 16 - 8,
        vy: -6 - rng() * 8,
        drag: 3,
        life: 0.35 + rng() * 0.25,
        draw: (pt, ox, oy) => {
          const k = pt.t / pt.life;
          const r = 2 + k * 3;
          R.ellipse(pt.x - ox, pt.y - oy, r * 2, r * 1.6, this.def.indoors ? C.dusk : C.cream, (1 - k) * 0.7);
        },
      });
    }
  }

  updateTarget() {
    this.target = null;
    if (this.busy > 0 || this.transitioning) return;
    const p = this.player;
    const [fx, fy] = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[p.facing] ?? [0, 1];
    const probeAt = (dist) => ({ x: p.x + fx * dist, y: p.y - 3 + fy * dist });
    let probe = probeAt(12);
    if (this.counters.some((c) => probe.x >= c.x && probe.x < c.x + c.w && probe.y >= c.y && probe.y < c.y + c.h)) probe = probeAt(30);
    const inside = (b, pt, pad = 0) => pt.x >= b.x - pad && pt.x < b.x + b.w + pad && pt.y >= b.y - pad && pt.y < b.y + b.h + pad;
    let best = null;
    let bestD = Infinity;
    for (const a of this.actors) {
      if (a === p || a === this.follower || !a.talk || !a.visible) continue;
      const b = { x: a.x - 8, y: a.y - 18, w: 16, h: 20 };
      if (inside(b, probe, 3)) {
        const d = Math.hypot(a.x - probe.x, a.y - 8 - probe.y);
        if (d < bestD) {
          bestD = d;
          best = { kind: 'npc', target: a, id: a.talk };
        }
      }
    }
    if (!best) {
      for (const it of this.interactables) {
        if (it.target?.taken) continue;
        if (inside(it.box, probe, 2)) {
          best = it;
          break;
        }
      }
    }
    this.target = best;
  }

  interact(it) {
    audio.sfx('confirm');
    if (it.kind === 'npc') {
      const npc = it.target;
      return runScript(this, async (g) => {
        npc.talking = true;
        const prevFlip = npc.flip;
        const prevFacing = npc.facing;
        npc.moving = false;
        npc.faceToward(this.player.x, this.player.y);
        this.player.faceToward(npc.x, npc.y);
        try {
          await story.talk(g, it.id, npc);
        } finally {
          npc.talking = false;
          if (npc.behavior !== 'wander') {
            npc.flip = prevFlip;
            npc.facing = prevFacing;
          }
        }
      });
    }
    return runScript(this, (g) => story.interact(g, it));
  }

  checkTriggers() {
    const b = this.player.box();
    let onAny = false;
    for (const t of this.triggers) {
      if (!overlap(b, t.box)) {
        // Each trigger re-arms as soon as Pip steps off that one, so walking from one
        // rune pad straight onto the next still fires both.
        t.fired = false;
        continue;
      }
      onAny = true;
      if (this.triggerLock || t.fired) continue;
      if (t.kind === 'exit') {
        const ok = story.canExit ? story.canExit(this, t) : true;
        if (ok === true) this.changeMap(t.to, t.spawn);
        return;
      }
      if (t.kind === 'script') {
        t.fired = true;
        runScript(this, (g) => story.trigger(g, t.id));
        return;
      }
    }
    if (!onAny) this.triggerLock = false;
  }

  async changeMap(to, spawn, pos) {
    if (this.transitioning) return;
    if (!MAPS[to]) {
      runScript(this, (g) => story.missingMap?.(g, to));
      return;
    }
    this.transitioning = true;
    audio.sfx('door');
    await G.fade(1, 0.25, '#000000');
    const prev = this.def?.name;
    this.load(to, spawn, pos);
    // A puff at the feet on the way through a door (F7).
    this.dust(this.player.x, this.player.y, 5);
    if (this.def.name !== prev) this.showBanner();
    await G.fade(0, 0.25);
    this.transitioning = false;
    story.onEnter?.(this, to);
  }

  showBanner() {
    this.banner = { name: this.def.name, subtitle: this.def.subtitle ?? null, t: 0 };
  }

  toast(str) {
    this.toasts.push({ text: str, t: 0 });
  }

  setBars(on) {
    this.barsOn = on;
    return G.wait(0.3);
  }

  // ---- drawing ----

  render() {
    const ox = this.camera.cx;
    const oy = this.camera.cy;
    R.fill(this.def.indoors ? C.ink : C.sand);
    const ix = Math.floor(ox);
    const iy = Math.floor(oy);
    R.img(this.ground, ix, iy, VW + 1, VH + 1, ix - ox, iy - oy);

    for (const o of this.objects) if (o.flat) o.draw(ox, oy);
    const t = this.time;
    for (const s of this.built.sway) {
      const x = s.x - ox;
      const y = s.y - oy;
      if (x < -16 || x > VW || y < -16 || y > VH) continue;
      const off = Math.round(Math.sin(t * 2.2 + s.phase));
      R.img(sheets.tiles, (s.tile % 18) * 16, Math.floor(s.tile / 18) * 16, 16, 8, x + off, y);
      R.img(sheets.tiles, (s.tile % 18) * 16, Math.floor(s.tile / 18) * 16 + 8, 16, 8, x, y + 8);
    }
    // Tumbleweeds roll on the ground, so characters pass in front of them.
    this.ambient.renderBelow(this, ox, oy);

    const list = [];
    for (const s of this.built.sprites) {
      const x = s.x - ox;
      const y = s.y - oy;
      if (x < -32 || x > VW + 8 || y < -40 || y > VH + 8) continue;
      list.push({ y: s.sortY, s });
    }
    for (const a of this.actors) list.push({ y: a.y + a.sortBias, a });
    for (const o of this.objects) if (!o.flat) list.push({ y: o.sortY, o });
    list.sort((p, q) => p.y - q.y);
    for (const it of list) {
      if (it.s) it.s.tiles.forEach((row, ry) => row.forEach((tile, rx) => R.tile(tile, it.s.x + rx * 16 - ox, it.s.y + ry * 16 - oy)));
      else if (it.a) it.a.draw(ox, oy);
      else it.o.draw(ox, oy);
    }
    this.particles.render(ox, oy);
    // Butterflies, blown sand and cave motes are in the air, above everyone.
    this.ambient.renderAbove(this, ox, oy);
    story.renderWorld?.(this, ox, oy);
    if (this.tint) R.fill(this.tint.color, this.tint.alpha);
    // Under the UI on purpose: dialogue, banners and menus are never darkened.
    this.lighting.render(this, ox, oy);
    this.renderUi(ox, oy);
  }

  renderUi(ox, oy) {
    for (const a of this.actors) {
      if (!a.emote) continue;
      const e = a.emote;
      const pop = Math.min(1, e.t / 0.1);
      const x = Math.round(a.x - ox - 8);
      const y = Math.round(a.headY() - oy - 14 + (1 - pop) * 4);
      if (e.kind === '!') R.ui(60, x, y, { alpha: pop });
      else if (e.kind === '...') R.ui(59, x, y, { alpha: pop });
      else text(e.kind, x + 5, y + 4 - Math.round(e.t * 6), { color: 'gold', alpha: 1 - e.t / e.dur });
    }
    if (this.target && this.canControl(true)) {
      const bob = Math.round(Math.sin(this.time * 5));
      if (this.target.kind === 'npc') {
        const a = this.target.target;
        if (!a.emote) R.ui(59, Math.round(a.x - ox - 8), Math.round(a.headY() - oy - 14 + bob));
      } else {
        const b = this.target.box;
        const label = input.label('confirm');
        const w = textWidth(label) + 6;
        const x = Math.round(b.x + b.w / 2 - ox - w / 2);
        const y = Math.round(b.y - oy - 12 + bob);
        R.tag(x, y, w, 11, C.white);
        text(label, x + 3, y + 1, { color: 'ink', shadow: false });
      }
    }
    if (this.bars > 0) {
      const h = Math.round(14 * ease.outCubic(this.bars));
      R.rect(0, 0, VW, h, '#000000');
      R.rect(0, VH - h, VW, h, '#000000');
    }
    if (this.banner) this.renderBanner();
    this.toasts.forEach((tt, i) => {
      const k = Math.min(1, tt.t / 0.2) * Math.min(1, (2.8 - tt.t) / 0.3);
      const w = textWidth(tt.text) + 14;
      const y = 6 + i * 16 + (this.banner ? 38 : 0);
      R.alpha(k, () => {
        R.box(VW / 2 - w / 2, y, w, 15, C.ink);
        text(tt.text, VW / 2, y + 3, { align: 'center' });
      });
    });
    story.renderHud?.(this);
  }

  renderBanner() {
    const b = this.banner;
    const inK = ease.outBack(clamp(b.t / 0.35, 0, 1));
    const outK = clamp((b.t - 2.4) / 0.35, 0, 1);
    const name = b.name.toUpperCase();
    const w = Math.max(bigWidth(name, 2) + 24, b.subtitle ? textWidth(b.subtitle) + 24 : 0);
    const h = b.subtitle ? 32 : 22;
    const y = Math.round(-h + (h + 6) * inK - (h + 8) * ease.inQuad(outK));
    R.box(VW / 2 - w / 2, y, w, h, C.ink);
    bigText(name, VW / 2, y + 3, { align: 'center', style: 2 });
    if (b.subtitle) text(b.subtitle, VW / 2, y + 20, { align: 'center', color: 'mist' });
  }
}
