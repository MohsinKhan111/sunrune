// Battle rules as pure functions. Every number here comes from DATA.md "The exact rules".
import { EXP_TABLE, MAX_LV, MEMBERS, SKILLS } from '../data/party.js';

export const TIMING = { lock: 900, perfect: 60, good: 150 };
export const GUARD = { impact: 500, start: 250, relaxedStart: 100 };
export const ROLL = { down: 16, up: 48 };
export const CRIT_CHANCE = 1 / 16;
export const MISS = { bash: 0.04, enemy: 0.06 };

export function statsAt(id, lv) {
  const m = MEMBERS[id];
  const k = lv - 1;
  return {
    hp: m.base.hp + m.grow.hp * k,
    sp: m.base.sp + m.grow.sp * k,
    atk: m.base.atk + m.grow.atk * k,
    def: m.base.def + m.grow.def * k,
    spd: m.base.spd + m.grow.spd * k,
  };
}

export function levelForExp(exp) {
  let lv = 1;
  for (let i = 1; i < EXP_TABLE.length; i++) if (exp >= EXP_TABLE[i]) lv = i + 1;
  return Math.min(lv, MAX_LV);
}

export function expToNext(lv, exp) {
  return lv >= MAX_LV ? 0 : Math.max(0, EXP_TABLE[lv] - exp);
}

export function skillsAt(id, lv) {
  return MEMBERS[id].skills.filter(([, at]) => at <= lv).map(([skill]) => skill);
}

export function baseDamage(atk, def) {
  return Math.max(1, atk * 2 - def);
}

// variance: a number in 0.85-1.15. mult: timing, crit, guard and sleep multipliers together.
export function damage(atk, def, power, variance, mult = 1) {
  return Math.max(1, Math.round(baseDamage(atk, def) * power * variance * mult));
}

export function rollVariance(rng) {
  return rng.range(0.85, 1.15);
}

// Timed hit. pressMs: ms after the crosshair appears, or null.
// 'perfect' | 'good' | 'early' | 'none'
export function timingGrade(pressMs, relaxed = false) {
  if (pressMs == null) return 'none';
  const k = relaxed ? 2 : 1;
  const d = pressMs - TIMING.lock;
  if (Math.abs(d) <= TIMING.perfect * k) return 'perfect';
  if (Math.abs(d) <= TIMING.good * k) return 'good';
  return d < 0 ? 'early' : 'none';
}

// When an unpressed Bash lands: the moment the GOOD window closes.
export function timingLandMs(relaxed = false) {
  return TIMING.lock + TIMING.good * (relaxed ? 2 : 1);
}

export function timingMultiplier(grade) {
  return grade === 'perfect' ? 1.5 : grade === 'good' ? 1.25 : 1;
}

// Guard timing. pressMs: ms into the enemy's wind-up, or null. 'block' | 'early' | 'none'
export function guardGrade(pressMs, relaxed = false) {
  if (pressMs == null) return 'none';
  const start = relaxed ? GUARD.relaxedStart : GUARD.start;
  if (pressMs < start) return 'early';
  if (pressMs <= GUARD.impact) return 'block';
  return 'none';
}

export function guardMultiplier(blocked, guarding) {
  return (blocked ? 0.6 : 1) * (guarding ? 0.5 : 1);
}

// actors: [{ key, spd, side: 'party'|'enemy', index }] → ordered copy.
export function turnOrder(actors, rng) {
  return actors
    .map((a) => ({ a, roll: a.spd * rng.range(0.85, 1.15) }))
    .sort((x, y) => {
      if (y.roll !== x.roll) return y.roll - x.roll;
      if (x.a.side !== y.a.side) return x.a.side === 'party' ? -1 : 1;
      return x.a.index - y.a.index;
    })
    .map((x) => x.a);
}

export function runChance(partySpd, enemySpd) {
  const avg = (list) => list.reduce((s, v) => s + v, 0) / Math.max(1, list.length);
  return Math.min(0.95, Math.max(0.2, 0.5 + 0.08 * (avg(partySpd) - avg(enemySpd))));
}

// enemies: enemy definitions from data/enemies.js. Each drop rolled once per enemy.
export function rewards(enemies, rng) {
  let exp = 0;
  let dollars = 0;
  const drops = [];
  for (const e of enemies) {
    exp += e.exp;
    dollars += e.dollars;
    if (e.drop && rng() < e.drop[1]) drops.push(e.drop[0]);
  }
  return { exp, dollars, drops };
}

// Adds EXP to a party member ({ id, lv, exp, hp, sp }) in place. Level ups fully restore
// HP and SP. Returns one entry per level gained.
export function applyExp(member, gained) {
  member.exp += gained;
  const ups = [];
  const target = levelForExp(member.exp);
  while (member.lv < target) {
    const before = statsAt(member.id, member.lv);
    const learnedBefore = skillsAt(member.id, member.lv);
    member.lv += 1;
    const after = statsAt(member.id, member.lv);
    member.hp = after.hp;
    member.sp = after.sp;
    const learned = skillsAt(member.id, member.lv).filter((s) => !learnedBefore.includes(s));
    ups.push({ lv: member.lv, before, after, learned });
  }
  return ups;
}

// One frame of the rolling HP meter.
export function rollHp(shown, real, dt) {
  if (shown > real) return Math.max(real, shown - ROLL.down * dt);
  if (shown < real) return Math.min(real, shown + ROLL.up * dt);
  return shown;
}

export function skillInfo(id) {
  return SKILLS[id];
}
