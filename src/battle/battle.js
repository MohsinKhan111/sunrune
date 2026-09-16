// The battle scene (F11, F12): side view, party on the left, enemies on the right (D20).
// Turn-based with timed hits, timed guarding and EarthBound's rolling HP meter (D16).
// Every rule comes from rules.js, which is unit-tested against DATA.md.
import { G } from '../game.js';
import { R } from '../engine/gfx.js';
import { VW, VH } from '../engine/screen.js';
import { C } from '../engine/palette.js';
import { input } from '../engine/input.js';
import { text, bigText, bigWidth, textWidth } from '../engine/font.js';
import { Particles } from '../engine/particles.js';
import { ease, clamp } from '../engine/ease.js';
import { makeRng } from '../engine/rng.js';
import { audio } from '../engine/audio.js';
import { charSheet, charWhite, enemySheet, enemyWhite } from '../engine/sheets.js';
import { CHARS } from '../data/chars.js';
import { ENEMIES, MOVES } from '../data/enemies.js';
import { MEMBERS, SKILLS } from '../data/party.js';
import { ITEMS } from '../data/items.js';
import {
  statsAt, damage, rollVariance, timingGrade, timingMultiplier, timingLandMs, guardGrade,
  guardMultiplier, turnOrder, runChance, rewards, applyExp, rollHp, skillsAt, CRIT_CHANCE, MISS, GUARD,
} from './rules.js';
import { makeBrain, chooseMove, pickTarget } from './ai.js';
import { itemCount, removeItem, addItem, addDollars } from '../story/state.js';
import { Background } from './bg.js';

const PARTY_POS = [{ x: 88, y: 126 }, { x: 56, y: 104 }];
// Enemies stand above the party boxes (which start at y 128).
const FOE_POS = {
  1: [{ x: 232, y: 114 }],
  2: [{ x: 212, y: 98 }, { x: 258, y: 120 }],
  3: [{ x: 198, y: 88 }, { x: 240, y: 106 }, { x: 280, y: 124 }],
};
const BOSS_POS = [{ x: 236, y: 130 }];
const MSG = { x: 4, y: 4, w: 312, h: 18 };
const CMD = { x: 4, y: 128, w: 108, h: 48 };

class Battler {
  constructor(o) {
    Object.assign(this, o);
    this.shown = this.hp;
    this.flat = this.hp <= 0;
    this.guarding = false;
    this.stunned = false;
    this.offset = 0;
    this.flashT = 0;
    this.squashT = 0;
    this.gone = false;
    this.goneT = 0;
    this.bob = Math.random() * 6.28;
  }

  get alive() {
    return !this.flat && !this.gone;
  }
}

export class BattleScene {
  constructor({ enemies, canRun = true, firstStrike = false, tutorial = false, checkpoint = false, onEnd }) {
    this.opaque = true;
    this.blocksUpdate = true;
    this.rng = makeRng((Date.now() & 0xffff) ^ 0x5ead);
    this.particles = new Particles(220);
    this.numbers = [];
    this.onEnd = onEnd ?? (() => {});
    this.canRun = canRun;
    this.firstStrike = firstStrike;
    this.tutorial = tutorial;
    this.checkpoint = checkpoint;
    this.msgText = '';
    this.t = 0;
    this.shakeT = 0;
    this.shakeA = 0;
    this.hitStop = 0;
    this.crosshair = null;
    this.guardWin = null;
    this.menu = null;
    this.result = null;
    this.round = 0;
    this.snapshot = JSON.parse(JSON.stringify({ party: G.state.party, items: G.state.items }));

    this.party = G.state.party.map((m, i) => {
      const s = statsAt(m.id, m.lv);
      return new Battler({
        key: `p${i}`, side: 'party', index: i, ref: m, id: m.id,
        name: m.id === 'pip' ? G.state.name : MEMBERS[m.id].name,
        sheet: charSheet[m.id], white: charWhite[m.id],
        hp: m.hp, maxHp: s.hp, sp: m.sp, maxSp: s.sp, atk: s.atk, def: s.def, spd: s.spd,
        pos: PARTY_POS[i] ?? PARTY_POS[0], scale: 2,
      });
    });

    const counts = {};
    for (const id of enemies) counts[id] = (counts[id] ?? 0) + 1;
    const seen = {};
    const boss = enemies.some((id) => ENEMIES[id].boss);
    const spots = boss ? BOSS_POS : FOE_POS[Math.min(3, enemies.length)];
    this.foes = enemies.map((id, i) => {
      const e = ENEMIES[id];
      seen[id] = (seen[id] ?? 0) + 1;
      const letter = counts[id] > 1 ? ` ${String.fromCharCode(64 + seen[id])}` : '';
      return new Battler({
        key: `e${i}`, side: 'enemy', index: i, id, data: e,
        name: e.name + letter,
        sheet: enemySheet[e.sprite], white: enemyWhite[e.sprite],
        hp: e.hp, maxHp: e.hp, atk: e.atk, def: e.def, spd: e.spd,
        pos: spots[i] ?? spots[spots.length - 1], scale: e.boss ? 4 : 2,
        brain: makeBrain(id), boss: !!e.boss,
      });
    });
    this.bg = new Background(ENEMIES[enemies[0]].bg);
    this.run();
  }

  // ---- helpers ----

  get relaxed() {
    return G.settings?.timing === 'relaxed';
  }

  wait(sec) {
    return G.wait(sec);
  }

  async msg(str, hold = 0.9) {
    this.msgText = str;
    if (hold) await this.wait(hold);
  }

  shake(a, sec = 0.25) {
    if (G.settings && !G.settings.shake) return;
    this.shakeA = a;
    this.shakeT = sec;
    this.shakeDur = sec;
  }

  popNumber(b, value, color) {
    this.numbers.push({ x: b.pos.x, y: b.pos.y - 24 - b.scale * 6, v: value, t: 0, color });
  }

  livingParty() {
    return this.party.filter((b) => b.alive);
  }

  livingFoes() {
    return this.foes.filter((b) => !b.gone);
  }

  // ---- the battle ----

  async run() {
    const names = this.foes.length === 1 ? `The ${this.foes[0].name}` : `${this.foes.length} enemies`;
    await this.msg(this.foes.length === 1 ? `${names} blocks the way!` : `${names} appear!`, 1);
    if (this.firstStrike) await this.msg('You got the jump on them!', 0.9);
    if (this.tutorial) await this.msg('Choose BASH, then press the button as the crosshair locks on!', 1.6);
    while (!this.result) {
      this.round++;
      const actions = await this.chooseCommands();
      if (this.result) break;
      await this.playRound(actions);
      this.checkEnd();
    }
    await this.finish();
  }

  // Menu flow: resolves with one action per living party member.
  chooseCommands() {
    return new Promise((resolve) => {
      this.pending = [];
      this.menu = { level: 'main', cursor: 0, actor: 0 };
      this.commandResolve = resolve;
      this.nextCommand(0);
    });
  }

  nextCommand(i) {
    const living = this.livingParty();
    if (i >= living.length) {
      this.menu = null;
      const done = this.pending;
      this.commandResolve?.(done);
      this.commandResolve = null;
      return;
    }
    this.menu = { level: 'main', cursor: 0, actor: i };
  }

  mainOptions() {
    return ['Bash', 'Guard', 'Skills', 'Run', 'Items'];
  }

  menuActor() {
    return this.livingParty()[this.menu.actor];
  }

  updateMenu() {
    const m = this.menu;
    if (!m) return;
    const actor = this.menuActor();
    if (!actor) {
      this.nextCommand(m.actor + 1);
      return;
    }
    const move = (n, cols = 1) => {
      if (input.repeat('down')) {
        m.cursor = (m.cursor + cols) % n;
        audio.sfx('cursor');
      }
      if (input.repeat('up')) {
        m.cursor = (m.cursor - cols + n) % n;
        audio.sfx('cursor');
      }
      if (cols > 1) {
        if (input.repeat('right')) {
          m.cursor = (m.cursor + 1) % n;
          audio.sfx('cursor');
        }
        if (input.repeat('left')) {
          m.cursor = (m.cursor - 1 + n) % n;
          audio.sfx('cursor');
        }
      }
    };

    if (m.level === 'main') {
      const opts = this.mainOptions();
      move(opts.length, 2);
      if (input.pressed('confirm')) {
        audio.sfx('confirm');
        const pick = opts[m.cursor];
        if (pick === 'Bash') this.startTargeting({ kind: 'bash' });
        else if (pick === 'Guard') this.commit({ kind: 'guard' });
        else if (pick === 'Run') {
          if (!this.canRun) this.flash('No running from this one!');
          else this.commit({ kind: 'run' });
        } else if (pick === 'Skills') {
          const list = skillsAt(actor.id, actor.ref.lv);
          if (!list.length) this.flash(`${actor.name} doesn't know any skills yet.`);
          else this.menu = { ...m, level: 'skills', cursor: 0, list };
        } else if (pick === 'Items') {
          const list = Object.keys(G.state.items).filter((k) => itemCount(G.state, k) > 0);
          if (!list.length) this.flash('Your satchel is empty.');
          else this.menu = { ...m, level: 'items', cursor: 0, list };
        }
      } else if (input.pressed('cancel') && m.actor > 0) {
        audio.sfx('cancel');
        this.pending.pop();
        this.nextCommand(m.actor - 1);
      }
      return;
    }

    if (m.level === 'skills' || m.level === 'items') {
      move(m.list.length);
      if (input.pressed('cancel')) {
        audio.sfx('cancel');
        this.menu = { ...m, level: 'main', cursor: 0 };
        return;
      }
      if (!input.pressed('confirm')) return;
      const id = m.list[m.cursor];
      if (m.level === 'skills') {
        const sk = SKILLS[id];
        if (actor.sp < sk.sp) {
          this.flash('Not enough SP!');
          return;
        }
        audio.sfx('confirm');
        if (sk.target === 'enemy') this.startTargeting({ kind: 'skill', id });
        else if (sk.target === 'ally') this.startTargeting({ kind: 'skill', id, allies: true });
        else this.commit({ kind: 'skill', id });
      } else {
        const it = ITEMS[id];
        audio.sfx('confirm');
        if (it.target === 'ally' || it.target === 'flat') this.startTargeting({ kind: 'item', id, allies: true, flat: it.target === 'flat' });
        else this.commit({ kind: 'item', id });
      }
      return;
    }

    if (m.level === 'target') {
      const list = m.targets;
      if (input.repeat('down') || input.repeat('right')) {
        m.cursor = (m.cursor + 1) % list.length;
        audio.sfx('cursor');
      }
      if (input.repeat('up') || input.repeat('left')) {
        m.cursor = (m.cursor - 1 + list.length) % list.length;
        audio.sfx('cursor');
      }
      if (input.pressed('cancel')) {
        audio.sfx('cancel');
        this.menu = { ...m, level: 'main', cursor: 0 };
        return;
      }
      if (input.pressed('confirm')) {
        audio.sfx('confirm');
        this.commit({ ...m.action, target: list[m.cursor] });
      }
    }
  }

  startTargeting(action) {
    const targets = action.allies
      ? this.party.filter((b) => (action.flat ? b.flat : !b.flat))
      : this.livingFoes();
    if (!targets.length) {
      this.flash('There is nobody to use that on.');
      return;
    }
    if (targets.length === 1) {
      this.commit({ ...action, target: targets[0] });
      return;
    }
    this.menu = { ...this.menu, level: 'target', cursor: 0, targets, action };
  }

  commit(action) {
    const actor = this.menuActor();
    this.pending.push({ actor, ...action });
    this.nextCommand(this.menu.actor + 1);
  }

  flash(str) {
    audio.sfx('error');
    this.msgText = str;
    this.flashT = 1.2;
  }

  async playRound(actions) {
    for (const f of this.foes) {
      if (f.gone) continue;
      f.guarding = false;
    }
    for (const p of this.party) p.guarding = false;

    const enemyActions = this.livingFoes().map((f) => {
      if (f.stunned) return { actor: f, kind: 'stunned' };
      const move = chooseMove(f.id, f.brain, this.rng);
      return { actor: f, kind: 'move', move };
    });
    const all = [...actions, ...enemyActions];
    const order = turnOrder(
      all.map((a, i) => ({ ...a, key: a.actor.key, spd: a.actor.spd, side: a.actor.side, index: i })),
      this.rng,
    );
    const first = this.firstStrike && this.round === 1;
    for (const act of order) {
      if (this.result) return;
      if (!act.actor.alive && act.actor.side === 'party') continue;
      if (act.actor.gone) continue;
      if (first && act.actor.side === 'enemy') continue;
      await this.perform(act);
      this.checkEnd();
      if (this.result) return;
    }
    for (const f of this.foes) f.stunned = false;
  }

  async perform(act) {
    const a = act.actor;
    if (a.side === 'party') {
      if (act.kind === 'guard') {
        a.guarding = true;
        await this.msg(`${a.name} braces.`, 0.6);
        return;
      }
      if (act.kind === 'run') return this.tryRun();
      if (act.kind === 'bash') return this.doBash(a, act.target);
      if (act.kind === 'skill') return this.doSkill(a, act);
      if (act.kind === 'item') return this.doItem(a, act);
      return;
    }
    if (act.kind === 'stunned') {
      await this.msg(`${a.name} is too dazed to move!`, 0.8);
      return;
    }
    return this.doEnemyMove(a, act.move);
  }

  async tryRun() {
    const chance = runChance(this.livingParty().map((b) => b.spd), this.livingFoes().map((b) => b.spd));
    if (this.rng() < chance) {
      await this.msg('You got away!', 0.8);
      this.result = { ran: true };
    } else {
      await this.msg("Couldn't get away!", 0.8);
    }
  }

  async lunge(b, dist, sec = 0.12) {
    const from = b.offset;
    const to = dist;
    const steps = Math.max(1, Math.round(sec * 60));
    for (let i = 1; i <= steps; i++) {
      b.offset = from + (to - from) * ease.outQuad(i / steps);
      await this.wait(1 / 60);
    }
  }

  async doBash(a, target) {
    if (!target || target.gone) target = this.livingFoes()[0];
    if (!target) return;
    await this.msg(`${a.name} swings the satchel!`, 0.35);
    const ranged = MEMBERS[a.id]?.attack === 'blaster';
    if (!ranged) await this.lunge(a, 40, 0.16);
    const press = await this.timedHit(target);
    const grade = timingGrade(press, this.relaxed);
    if (grade === 'perfect') await this.msg('PERFECT!', 0);
    else if (grade === 'good') await this.msg('GOOD!', 0);
    const crit = this.rng() < CRIT_CHANCE;
    audio.sfx(ranged ? 'shoot' : 'hit');
    if (this.rng() < MISS.bash) {
      this.popNumber(target, 'MISS', C.mist);
      await this.msg(`${a.name} missed!`, 0.7);
    } else {
      const mult = crit ? 2 : timingMultiplier(grade);
      const dmg = damage(a.atk, target.def, 1, rollVariance(this.rng), mult * (target.asleep ? 1.5 : 1));
      this.hurt(target, dmg, crit ? 'SMAAAASH!' : null, grade === 'perfect' || crit);
      if (crit) await this.msg('SMAAAASH!', 0.5);
    }
    if (!ranged) await this.lunge(a, 0, 0.14);
    await this.wait(0.35);
  }

  async doSkill(a, act) {
    const sk = SKILLS[act.id];
    a.sp = Math.max(0, a.sp - sk.sp);
    a.ref.sp = a.sp;
    await this.msg(`${a.name} uses ${sk.name}!`, 0.5);
    audio.sfx('skill');
    if (sk.heal) {
      const who = act.target ?? a;
      this.heal(who, sk.heal);
      await this.wait(0.6);
      return;
    }
    const targets = sk.target === 'enemies' ? this.livingFoes() : [act.target ?? this.livingFoes()[0]];
    for (const t of targets) {
      if (!t || t.gone) continue;
      const dmg = damage(a.atk, t.def, sk.power, rollVariance(this.rng), t.asleep ? 1.5 : 1);
      this.hurt(t, dmg, null, true);
      if (sk.stun && !t.boss && this.rng() < sk.stun) {
        t.stunned = true;
        this.popNumber(t, 'STUN', C.butter);
      }
      await this.wait(0.12);
    }
    await this.wait(0.4);
  }

  async doItem(a, act) {
    const it = ITEMS[act.id];
    removeItem(G.state, act.id, 1);
    await this.msg(`${a.name} uses the ${it.name}!`, 0.5);
    audio.sfx('item');
    if (it.use === 'heal') this.heal(act.target ?? a, it.amount);
    else if (it.use === 'sp') {
      const who = act.target ?? a;
      who.sp = Math.min(who.maxSp, who.sp + it.amount);
      who.ref.sp = who.sp;
      this.popNumber(who, `+${it.amount}`, C.sky);
    } else if (it.use === 'revive') {
      const who = act.target;
      if (who) {
        who.flat = false;
        who.hp = Math.floor(who.maxHp / 2);
        who.shown = who.hp;
        this.popNumber(who, 'UP!', C.mint);
      }
    } else if (it.use === 'bomb') {
      for (const t of this.livingFoes()) {
        this.hurt(t, it.amount, null, true);
        await this.wait(0.1);
      }
    }
    await this.wait(0.5);
  }

  async doEnemyMove(a, moveId) {
    const move = MOVES[moveId];
    const name = a.name;
    // The rage phase (DATA.md "Grumblejaw's script"): the first time he drops to half
    // health he hits harder and moves sooner. The brain already changed his pattern for
    // it; the stats and the line were never applied.
    if (a.brain?.justRaged) {
      a.brain.justRaged = false;
      a.atk += 3;
      a.spd += 2;
      this.shake(3, 0.3);
      await this.msg(`${name} is getting grumpier!`, 1);
    }
    if (moveId === 'grumpy_nap') {
      a.asleep = true;
      a.hp = Math.min(a.maxHp, a.hp + move.heal);
      a.shown = a.hp;
      this.popNumber(a, `+${move.heal}`, C.mint);
      await this.msg(move.text.replace('{name}', name), 1);
      return;
    }
    if (moveId === 'wake') {
      a.asleep = false;
      await this.msg(move.text.replace('{name}', name), 1);
      return;
    }
    if (move.target === 'none') {
      await this.msg(move.text.replace('{name}', name), 1.1);
      return;
    }
    const targets = move.target === 'all' ? this.livingParty() : [pickTarget(this.livingParty().map((b) => ({ ...b, flat: false, self: b })), this.rng)?.self].filter(Boolean);
    await this.msg(move.text.replace('{name}', name).replace('{target}', targets[0]?.name ?? 'everyone'), 0.5);
    await this.lunge(a, -26, 0.14);
    const press = await this.guardWindow(targets[0]);
    const blocked = guardGrade(press, this.relaxed) === 'block';
    audio.sfx('hurt');
    for (const t of targets) {
      if (!t.alive) continue;
      if (this.rng() < MISS.enemy) {
        this.popNumber(t, 'MISS', C.mist);
        continue;
      }
      const mult = guardMultiplier(blocked, t.guarding);
      const dmg = damage(a.atk, t.def, move.power, rollVariance(this.rng), mult);
      this.hurt(t, dmg, null, false);
    }
    if (blocked) await this.msg('Blocked!', 0.5);
    await this.lunge(a, 0, 0.14);
    await this.wait(0.3);
  }

  hurt(target, dmg, label, big) {
    target.hp = Math.max(0, target.hp - dmg);
    target.flashT = 0.06;
    target.squashT = 0.12;
    this.popNumber(target, dmg, C.white);
    // Scaled by how hard it landed rather than by a flag (F12). A third of a target's
    // health is treated as a full-strength hit. shake() already does nothing at all when
    // screen shake is turned off.
    const power = Math.min(1, dmg / Math.max(1, target.maxHp * 0.35));
    this.shake((big ? 3 : 1.5) + power * 3, 0.22);
    if (big) this.hitStop = 0.06;
    if (target.side === 'enemy') {
      target.shown = target.hp;
      if (target.hp <= 0) this.calm(target);
      if (target.brain?.onHp) target.brain.onHp(target.hp, target.maxHp);
    } else {
      target.ref.hp = target.hp;
    }
  }

  heal(who, amount) {
    if (!who) return;
    const before = who.hp;
    who.hp = Math.min(who.maxHp, who.hp + amount);
    if (who.side === 'party') who.ref.hp = who.hp;
    this.popNumber(who, `+${who.hp - before}`, C.mint);
    audio.sfx('heal');
  }

  calm(b) {
    b.gone = true;
    b.goneT = 0;
    audio.sfx('calm');
  }

  checkEnd() {
    if (this.result) return true;
    if (!this.livingFoes().length) {
      this.result = { won: true };
      return true;
    }
    if (!this.livingParty().length) {
      this.result = { lost: true };
      return true;
    }
    return false;
  }

  // The crosshair shrinks onto the target; resolves with the press time in ms, or null.
  timedHit(target) {
    return new Promise((resolve) => {
      this.crosshair = { t: 0, target, resolve, land: timingLandMs(this.relaxed) / 1000 };
    });
  }

  guardWindow(target) {
    return new Promise((resolve) => {
      this.guardWin = { t: 0, target, resolve };
    });
  }

  async finish() {
    if (this.result.ran) {
      await this.close();
      return;
    }
    if (this.result.won) {
      for (const b of this.party) {
        if (b.flat) continue;
        b.hp = Math.max(1, Math.ceil(b.shown));
        b.ref.hp = b.hp;
      }
      audio.music('victory');
      await this.msg('YOU WON!', 1);
      for (const f of this.foes) await this.msg(`${f.name} calmed down!`, 0.7);
      const r = rewards(this.foes.map((f) => f.data), this.rng);
      G.state.stats.battlesWon++;
      addDollars(G.state, r.dollars);
      for (const b of this.party) {
        if (b.flat) continue;
        await this.msg(`${b.name} gained ${r.exp} EXP.`, 0.7);
        const ups = applyExp(b.ref, r.exp);
        for (const up of ups) {
          audio.sfx('levelup');
          audio.music('levelup');
          this.levelUp = { name: b.name, up, t: 0 };
          // Sparkles rising off that member's own box (F7).
          const bx = 116 + this.party.indexOf(b) * 100;
          for (let n = 0; n < 16; n++) {
            this.particles.add({
              x: bx + 8 + Math.random() * 80,
              // Just above the box, not inside it: particles are drawn before the boxes,
              // so anything starting within one is painted over for its whole life.
              y: 128,
              vx: (Math.random() - 0.5) * 20,
              vy: -20 - Math.random() * 40,
              life: 0.7 + Math.random() * 0.5,
              size: Math.random() < 0.5 ? 2 : 1,
              // White and mint, not gold: the battle backgrounds are warm, and gold
              // sparkles on an amber background are the same mistake as sand on sand.
              color: Math.random() < 0.5 ? C.white : C.mint,
            });
          }
          await this.msg(`${b.name} reached LV ${up.lv}!`, 2.2);
          for (const sk of up.learned) await this.msg(`${b.name} learned ${SKILLS[sk].name}!`, 1.2);
          this.levelUp = null;
          b.maxHp = up.after.hp;
          b.maxSp = up.after.sp;
          b.hp = b.ref.hp;
          b.sp = b.ref.sp;
          b.shown = b.hp;
          b.atk = up.after.atk;
          b.def = up.after.def;
          b.spd = up.after.spd;
        }
      }
      if (r.dollars) await this.msg(`Found ${r.dollars} sand dollars.`, 0.8);
      for (const drop of r.drops) {
        if (addItem(G.state, drop, 1)) await this.msg(`${this.party[0].name} found a ${ITEMS[drop].name}!`, 0.9);
      }
      await this.close();
      return;
    }
    // Defeat
    audio.music('lose');
    const names = this.party.map((b) => b.name);
    await this.msg(`${names.join(' and ')} got knocked flat...`, 1.4);
    this.phase = 'defeat';
    this.defeat = { cursor: 0, options: ['Try again', 'Back to your last letter'] };
  }

  async close() {
    await G.fade(1, 0.3, '#000000');
    G.pop(this);
    this.onEnd(this.result);
    await G.fade(0, 0.3);
  }

  retry() {
    G.state.party = JSON.parse(JSON.stringify(this.snapshot.party));
    G.state.items = JSON.parse(JSON.stringify(this.snapshot.items));
    this.onEnd({ retry: true });
    G.pop(this);
  }

  // ---- update ----

  update(dt, isTop) {
    this.t += dt;
    this.bg.update(dt);
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    for (const b of [...this.party, ...this.foes]) {
      b.shown = rollHp(b.shown, b.hp, dt);
      if (b.side === 'party' && !b.flat && b.shown <= 0) {
        b.flat = true;
        b.hp = 0;
        b.ref.hp = 0;
        audio.sfx('fall');
      }
      if (b.flashT > 0) b.flashT -= dt;
      if (b.squashT > 0) b.squashT -= dt;
      if (b.gone) b.goneT += dt;
      b.bob += dt;
    }
    for (const n of this.numbers) n.t += dt;
    this.numbers = this.numbers.filter((n) => n.t < 0.85);
    this.particles.update(dt);
    if (this.shakeT > 0) this.shakeT -= dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (this.levelUp) this.levelUp.t += dt;

    if (this.crosshair) {
      const c = this.crosshair;
      c.t += dt;
      if (c.press == null && input.pressed('confirm')) {
        c.press = c.t * 1000;
        audio.sfx('lock');
        const done = c.resolve;
        this.crosshair = null;
        done(c.press);
      } else if (c.t >= c.land) {
        const done = c.resolve;
        this.crosshair = null;
        done(null);
      }
      return;
    }
    if (this.guardWin) {
      const g = this.guardWin;
      g.t += dt;
      if (g.press == null && input.pressed('confirm')) g.press = g.t * 1000;
      if (g.t >= GUARD.impact / 1000) {
        const done = g.resolve;
        const press = g.press;
        this.guardWin = null;
        done(press);
      }
      return;
    }
    if (this.phase === 'defeat') {
      const d = this.defeat;
      if (input.repeat('down') || input.repeat('up')) {
        d.cursor = 1 - d.cursor;
        audio.sfx('cursor');
      }
      if (input.pressed('confirm')) {
        audio.sfx('confirm');
        if (d.cursor === 0) this.retry();
        else {
          this.onEnd({ load: true });
          G.pop(this);
        }
      }
      return;
    }
    if (this.menu && isTop) this.updateMenu();
  }

  // ---- drawing ----

  render() {
    const sx = this.shakeT > 0 ? Math.round((Math.random() * 2 - 1) * this.shakeA) : 0;
    const sy = this.shakeT > 0 ? Math.round((Math.random() * 2 - 1) * this.shakeA) : 0;
    this.bg.render();
    R.rect(0, 96, VW, VH - 96, C.ink, 0.25);

    for (const b of [...this.foes, ...this.party]) this.drawBattler(b, sx, sy);
    this.particles.render(-sx, -sy);
    for (const n of this.numbers) {
      const k = n.t / 0.85;
      const y = n.y - ease.outCubic(Math.min(1, k * 2)) * 14 + sy;
      const str = String(n.v);
      if (typeof n.v === 'number') bigText(str, n.x + sx, y, { align: 'center', color: n.color === C.white ? 'white' : 'mint', alpha: 1 - k * k, style: 1 });
      else text(str, n.x + sx, y, { align: 'center', color: 'gold', alpha: 1 - k * k });
    }

    if (this.crosshair) this.drawCrosshair();
    if (this.guardWin && this.guardWin.t > GUARD.start / 1000 && this.guardWin.target) {
      const t = this.guardWin.target;
      R.ui(60, Math.round(t.pos.x - 8), Math.round(t.pos.y - 46));
    }

    R.box(MSG.x, MSG.y, MSG.w, MSG.h, C.ink);
    text(this.msgText, MSG.x + 8, MSG.y + 5);

    for (const b of this.party) this.drawPartyBox(b);
    if (this.menu) this.drawMenu();
    if (this.levelUp) this.drawLevelUp();
    if (this.phase === 'defeat') this.drawDefeat();
  }

  drawBattler(b, sx, sy) {
    if (b.gone && b.goneT > 0.6) return;
    const dir = b.side === 'party' ? 1 : -1;
    const x = b.pos.x + b.offset * dir + sx;
    const y = b.pos.y + sy;
    const s = b.scale;
    const bob = b.side === 'enemy' && !b.gone ? Math.round(Math.sin(b.bob * 2) * 2) : 0;
    let frame = 0;
    if (b.flat || b.gone) frame = 3;
    else if (b.guarding) frame = 1;
    const squash = b.squashT > 0 ? 0.86 : 1;
    const sheet = b.flashT > 0 ? b.white : b.sheet;
    const alpha = b.gone ? clamp(1 - b.goneT / 0.6, 0, 1) : 1;
    if (!b.flat && !b.gone) R.shadow(x, y + 1, 10 * s, 3 * s, 0.3);
    // (x, y) is the feet; the pivot below does the scaling, so pass the unscaled corner.
    R.sprite(sheet, frame, x - 12, y - 24 + bob, {
      flip: b.side === 'enemy',
      scale: s,
      scaleY: s * squash,
      px: 12,
      py: 24,
      alpha,
    });
    if (b.gone && b.goneT < 0.6 && Math.random() < 0.4) {
      this.particles.add({
        x: x + (Math.random() * 20 - 10) * s * 0.5,
        y: y - Math.random() * 20 * s * 0.5,
        vy: -18,
        life: 0.5,
        size: 2,
        color: Math.random() < 0.5 ? C.white : C.butter,
      });
    }
    if (b.asleep) text('z', x + 6 * s, y - 24 * s - 4 - Math.round(Math.sin(this.t * 3) * 2), { color: 'mist' });
  }

  drawCrosshair() {
    const c = this.crosshair;
    const t = c.target;
    if (!t) return;
    const k = clamp(c.t / (900 / 1000), 0, 1.4);
    const scale = 3 - 2 * Math.min(1, k);
    const locked = Math.abs(c.t * 1000 - 900) <= 60 * (this.relaxed ? 2 : 1);
    R.weapon(locked ? 35 : 25, t.pos.x - 12 * scale, t.pos.y - 24 - 12 * scale, { scale, alpha: 0.9 });
  }

  drawPartyBox(b) {
    const i = this.party.indexOf(b);
    const x = 116 + i * 100;
    const y = 130;
    R.box(x, y, 96, 46, b.flat ? C.plum : C.ink);
    text(b.name, x + 7, y + 4, { color: b.flat ? 'red' : 'white' });
    const rolling = Math.abs(b.shown - b.hp) > 0.4;
    const hp = Math.ceil(b.shown);
    text('HP', x + 7, y + 18, { color: 'mist' });
    bigText(String(hp), x + 26, y + 15, { style: 2, color: rolling ? 'gold' : 'white' });
    text(`/${b.maxHp}`, x + 26 + bigWidth(String(hp), 2) + 3, y + 20, { color: 'mist' });
    text('SP', x + 7, y + 32, { color: 'mist' });
    bigText(String(b.sp), x + 26, y + 29, { style: 2, color: 'sky' });
    text(`/${b.maxSp}`, x + 26 + bigWidth(String(b.sp), 2) + 3, y + 34, { color: 'mist' });
    R.rect(x + 7, y + 14, 82, 1, C.plum);
    R.rect(x + 7, y + 14, Math.round(82 * clamp(b.shown / b.maxHp, 0, 1)), 1, C.red);
    R.rect(x + 7, y + 43, 82, 1, C.plum);
    R.rect(x + 7, y + 43, Math.round(82 * clamp(b.sp / b.maxSp, 0, 1)), 1, C.blue);
  }

  drawMenu() {
    const m = this.menu;
    const actor = this.menuActor();
    if (!actor) return;
    if (m.level === 'main' || m.level === 'target') {
      const opts = this.mainOptions();
      R.box(CMD.x, CMD.y, CMD.w, CMD.h, C.ink);
      text(actor.name, CMD.x + 8, CMD.y + 3, { color: 'gold' });
      opts.forEach((o, i) => {
        const col = i % 2;
        const row = Math.floor(i / 2);
        const ox = CMD.x + 10 + col * 52;
        const oy = CMD.y + 16 + row * 11;
        const sel = m.level === 'main' && i === m.cursor;
        text(o, ox + 6, oy, { color: sel ? 'gold' : 'white' });
        if (sel) text('→', ox - 2 + Math.round(Math.sin(this.t * 8) * 0.8), oy, { color: 'gold' });
      });
    }
    if (m.level === 'target') {
      const t = m.targets[m.cursor];
      R.weapon(25, t.pos.x - 12, t.pos.y - 36, { alpha: 0.9 });
      const w = textWidth(t.name) + 10;
      R.box(clamp(t.pos.x - w / 2, 2, VW - w - 2), t.pos.y - 54, w, 14, C.ink);
      text(t.name, t.pos.x, t.pos.y - 51, { align: 'center' });
    }
    if (m.level === 'skills' || m.level === 'items') {
      const rows = m.list.length;
      const w = 150;
      const h = rows * 12 + 26;
      const x = CMD.x;
      const y = CMD.y - h + CMD.h;
      R.box(x, y, w, h, C.ink);
      text(m.level === 'skills' ? 'Skills' : 'Items', x + 8, y + 4, { color: 'gold' });
      m.list.forEach((id, i) => {
        const sel = i === m.cursor;
        const label = m.level === 'skills' ? SKILLS[id].name : ITEMS[id].name;
        const right = m.level === 'skills' ? `${SKILLS[id].sp} SP` : `×${itemCount(G.state, id)}`;
        text(label, x + 18, y + 18 + i * 12, { color: sel ? 'gold' : 'white' });
        text(right, x + w - 8, y + 18 + i * 12, { align: 'right', color: 'mist' });
        if (sel) text('→', x + 8, y + 18 + i * 12, { color: 'gold' });
      });
      const id = m.list[m.cursor];
      const desc = m.level === 'skills' ? SKILLS[id].desc : ITEMS[id].desc;
      R.box(x + w, y, VW - x - w - 4, h, C.ink);
      const lines = desc.split(' ').reduce((acc, word) => {
        const last = acc[acc.length - 1];
        if (last && textWidth(`${last} ${word}`) < VW - x - w - 20) acc[acc.length - 1] = `${last} ${word}`;
        else acc.push(word);
        return acc;
      }, []);
      lines.forEach((l, i) => text(l, x + w + 8, y + 6 + i * 11, { color: 'mist' }));
    }
  }

  drawLevelUp() {
    const { name, up, t } = this.levelUp;
    const k = ease.outBack(clamp(t / 0.3, 0, 1));
    const w = 132;
    const h = 74;
    const x = VW / 2 - w / 2;
    const y = Math.round(40 - (1 - k) * 20);
    R.box(x, y, w, h, C.ink);
    text(`${name} reached LV ${up.lv}!`, VW / 2, y + 6, { align: 'center', color: 'gold' });
    const rows = [['HP', up.before.hp, up.after.hp], ['SP', up.before.sp, up.after.sp], ['ATK', up.before.atk, up.after.atk], ['DEF', up.before.def, up.after.def], ['SPD', up.before.spd, up.after.spd]];
    rows.forEach(([label, a, b], i) => {
      const ry = y + 20 + i * 11;
      text(label, x + 12, ry, { color: 'mist' });
      text(String(a), x + 48, ry, { align: 'right' });
      text('→', x + 54, ry, { color: 'mist' });
      text(String(b), x + 96, ry, { align: 'right', color: b > a ? 'mint' : 'white' });
    });
  }

  drawDefeat() {
    const w = 150;
    const h = 52;
    const x = VW / 2 - w / 2;
    const y = 70;
    R.box(x, y, w, h, C.ink);
    text('What now?', x + 10, y + 6, { color: 'gold' });
    this.defeat.options.forEach((o, i) => {
      const sel = i === this.defeat.cursor;
      text(o, x + 22, y + 22 + i * 12, { color: sel ? 'gold' : 'white' });
      if (sel) text('→', x + 10, y + 22 + i * 12, { color: 'gold' });
    });
  }
}

// Swirl into the battle, run it, then hand the result back.
export async function startBattle(world, config) {
  audio.sfx('encounter');
  // Put the map's song back afterwards, whichever way the fight ends.
  const back = world?.def?.music ?? null;
  audio.music(config.enemies.some((id) => ENEMIES[id].boss) ? 'boss' : 'battle');
  await new Promise((resolve) => G.push(new SwirlScene(resolve)));
  const result = await new Promise((resolve) => {
    G.push(new BattleScene({ ...config, onEnd: resolve }));
  });
  audio.music(back);
  return result;
}

class SwirlScene {
  constructor(resolve) {
    this.opaque = false;
    this.blocksUpdate = true;
    this.t = 0;
    this.resolve = resolve;
    // Calmer rings, and never white, when the player has asked for less flashing (F3).
    this.calm = !!G.settings?.reduceFlashing;
    this.dur = this.calm ? 0.6 : 0.5;
  }

  update(dt) {
    this.t += dt;
    if (this.t >= this.dur) {
      G.pop(this);
      this.resolve();
    }
  }

  render() {
    const k = this.t / this.dur;
    const cols = this.calm
      ? [C.lilac, C.plum, C.dusk, C.steel, C.lilac]
      : [C.gold, C.salmon, C.lilac, C.mint, C.white];
    const peak = this.calm ? 0.45 : 0.9;
    for (let i = 0; i < 6; i++) {
      const p = clamp(k * 1.6 - i * 0.1, 0, 1);
      if (p <= 0) continue;
      const r = (1 - p) * 260 + 8;
      R.ellipse(VW / 2, VH / 2, r * 2, r * 1.5, cols[i % cols.length], peak * p);
    }
  }
}
