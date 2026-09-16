// The chapter's nine battles, simulated with the real rules and the real enemy AI, so
// the numbers checked here are the numbers the game plays with (F11, F13, F23).
// Fixed seeds: the same run every time, so a tuning change shows up as a changed result
// rather than as noise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeRng } from '../../src/engine/rng.js';
import { ENEMIES, MOVES } from '../../src/data/enemies.js';
import { ITEMS } from '../../src/data/items.js';
import {
  statsAt, damage, rollVariance, timingMultiplier, turnOrder, rewards, applyExp,
  CRIT_CHANCE, MISS,
} from '../../src/battle/rules.js';
import { chooseMove, makeBrain } from '../../src/battle/ai.js';

// DATA.md "Placed enemies (9 battles)", in the order a player meets them.
const BATTLES = [
  ['glimmerslug'],                                 // e1 tutorial, Pip alone
  ['glimmerslug', 'glimmerslug'],                  // e2
  ['dune_moth'],                                   // e3
  ['dune_moth', 'dune_moth'],                      // e4
  ['glimmerslug', 'dune_moth'],                    // e5
  ['cinder_imp', 'cinder_imp'],                    // e6 the Cinder Twins
  ['cinder_imp', 'dune_moth'],                     // e7
  ['glimmerslug', 'glimmerslug', 'glimmerslug'],   // e8
  ['grumblejaw'],                                  // e9 boss
];
const BOSS = BATTLES.length - 1;

// What the chapter hands a player along the way - chests, Pemberton's gift, the shop -
// keyed by how many battles have been fought when it arrives.
const PICKUPS = {
  1: { cactus_candy: 2 },
  4: { fizzy_dew: 2 },
  6: { cactus_candy: 2, dust_bomb: 1 },
  7: { sun_tea: 1, dust_bomb: 2 },
};

const BOTS = {
  careful: { timing: 0.6, healAt: 0.35, items: true },
  average: { timing: 0.3, healAt: 0.25, items: true },
  lazy: { timing: 0, healAt: 0, items: false },
};

// Battles that a player reaches having just passed a Post Terminal.
const TERMINALS = new Set([1, 5, BATTLES.length - 1]);

const RUNS = 500;

function member(id, lv) {
  const s = statsAt(id, lv);
  return { id, lv, exp: 0, hp: s.hp, sp: s.sp };
}

function alive(list, rng) {
  const up = list.filter((p) => p.m.hp > 0);
  return up.length ? up[Math.floor(rng() * up.length)] : null;
}

function fight(groupIds, party, bot, rng) {
  const foes = groupIds.map((id, i) => {
    const d = ENEMIES[id];
    return {
      side: 'enemy', key: `e${i}`, index: i, id, d,
      // Own copies of the stats: the rage buff must not leak into the shared enemy
      // data and quietly strengthen every later run.
      hp: d.hp, maxHp: d.hp, atk: d.atk, def: d.def, spd: d.spd,
      brain: makeBrain(id), asleep: false,
    };
  });
  const crew = party.members.map((m, i) => {
    const s = statsAt(m.id, m.lv);
    return { side: 'party', key: `p${i}`, index: i, m, s, spd: s.spd };
  });

  const foesDown = () => foes.every((f) => f.hp <= 0);
  const crewDown = () => crew.every((p) => p.m.hp <= 0);

  // 40 rounds is far beyond any real fight; it only stops a stalemate hanging the test.
  for (let round = 1; round <= 40; round++) {
    const up = [...crew.filter((p) => p.m.hp > 0), ...foes.filter((f) => f.hp > 0)];
    for (const a of turnOrder(up, rng)) {
      if (foesDown() || crewDown()) break;
      if (a.side === 'party') {
        if (a.m.hp <= 0) continue;
        takeTurn(a, foes, party, bot, rng);
      } else {
        if (a.hp <= 0) continue;
        enemyTurn(a, crew, rng);
      }
    }
    if (foesDown()) return { won: true, rounds: round };
    if (crewDown()) return { won: false, rounds: round };
  }
  return { won: false, rounds: 40, stalled: true };
}

function takeTurn(a, foes, party, bot, rng) {
  // Heal first if this bot carries anything and is hurt enough to bother.
  const stock = party.items.cactus_candy ?? 0;
  if (bot.items && stock > 0 && a.m.hp / a.s.hp < bot.healAt) {
    party.items.cactus_candy = stock - 1;
    a.m.hp = Math.min(a.s.hp, a.m.hp + ITEMS.cactus_candy.amount);
    return;
  }
  const target = foes.find((f) => f.hp > 0);
  if (!target) return;
  if (rng() < MISS.bash) return;
  const crit = rng() < CRIT_CHANCE;
  // How often this bot lands the timed hit at all, and how well when it does.
  const grade = rng() < bot.timing ? (rng() < 0.5 ? 'perfect' : 'good') : 'none';
  const mult = (crit ? 2 : timingMultiplier(grade)) * (target.asleep ? 1.5 : 1);
  target.hp -= damage(a.s.atk, target.def, 1, rollVariance(rng), mult);
  target.brain?.onHp(target.hp, target.maxHp);
}

function enemyTurn(f, crew, rng) {
  // Rage: harder and faster the first time he drops to half health.
  if (f.brain?.justRaged) {
    f.brain.justRaged = false;
    f.atk += 3;
    f.spd += 2;
  }
  const move = MOVES[chooseMove(f.id, f.brain, rng)];
  if (move.heal) {
    f.hp = Math.min(f.maxHp, f.hp + move.heal);
    f.asleep = true;
    return;
  }
  f.asleep = false;
  if (!move.power) return;
  const targets = move.target === 'all' ? crew.filter((p) => p.m.hp > 0) : [alive(crew, rng)];
  for (const t of targets) {
    if (!t || rng() < MISS.enemy) continue;
    t.m.hp = Math.max(0, t.m.hp - damage(f.atk, t.s.def, move.power, rollVariance(rng), 1));
  }
}

// One playthrough of the chapter, in order, carrying HP and EXP between fights.
function runChapter(bot, rng) {
  const party = { members: [member('pip', 1)], items: {} };
  const results = [];
  for (let i = 0; i < BATTLES.length; i++) {
    if (i === 1) party.members.push(member('biscuit', party.members[0].lv));
    const found = PICKUPS[i];
    if (found && bot.items) {
      for (const [id, n] of Object.entries(found)) party.items[id] = (party.items[id] ?? 0) + n;
    }
    // Writing home at a Post Terminal puts the whole party back on their feet, and the
    // chapter has three of them: in the Post Office before the canyon, in the canyon
    // itself a few steps from the Cinder Twins, and in the Hollow right before
    // Grumblejaw. They are free and directly on the path, so every player uses them.
    if (TERMINALS.has(i)) {
      for (const m of party.members) {
        const s = statsAt(m.id, m.lv);
        m.hp = s.hp;
        m.sp = s.sp;
      }
    }
    const r = fight(BATTLES[i], party, bot, rng);
    results.push(r);
    if (!r.won) return { results, lostAt: i, party };
    const prize = rewards(BATTLES[i].map((id) => ENEMIES[id]), rng);
    for (const m of party.members) if (m.hp > 0) applyExp(m, prize.exp);
  }
  return { results, lostAt: null, party };
}

function sample(botName, seed) {
  const bot = BOTS[botName];
  const rng = makeRng(seed);
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(runChapter(bot, rng));
  return runs;
}

const careful = sample('careful', 1234);
const average = sample('average', 5678);
const lazy = sample('lazy', 9012);

const reachedBoss = (runs) => runs.filter((r) => r.results.length === BATTLES.length);
const beatBoss = (runs) => runs.filter((r) => r.lostAt === null);

test('careful and average reach Grumblejaw at LV4 or better', () => {
  for (const [name, runs] of [['careful', careful], ['average', average]]) {
    const got = reachedBoss(runs);
    assert.ok(got.length > 0, `${name} never reached the boss`);
    // Pip is the player, and she is expected to be ready every single time.
    const pip = Math.min(...got.map((r) => r.party.members[0].lv));
    assert.ok(pip >= 4, `${name} reached Grumblejaw with Pip at LV ${pip}, wanted LV4+`);
    // A companion knocked flat earns nothing from that fight - the game's own rule - so
    // a rare run leaves Biscuit behind. That is allowed; it being common is not.
    const ready = got.filter((r) => r.party.members.every((m) => m.lv >= 4)).length / got.length;
    assert.ok(ready >= 0.98, `${name} had the whole party at LV4+ in only ${(ready * 100).toFixed(1)}% of runs`);
  }
});

test('a careful player beats Grumblejaw at least 95% of the time', () => {
  const rate = beatBoss(careful).length / RUNS;
  assert.ok(rate >= 0.95, `careful won ${(rate * 100).toFixed(1)}%, wanted 95%`);
});

test('an average player beats Grumblejaw at least 85% of the time', () => {
  const rate = beatBoss(average).length / RUNS;
  assert.ok(rate >= 0.85, `average won ${(rate * 100).toFixed(1)}%, wanted 85%`);
});

test('a lazy player still wins every regular battle at least 90% of the time', () => {
  const wins = new Array(BOSS).fill(0);
  const fought = new Array(BOSS).fill(0);
  for (const run of lazy) {
    run.results.forEach((r, i) => {
      if (i >= BOSS) return;
      fought[i]++;
      if (r.won) wins[i]++;
    });
  }
  for (let i = 0; i < BOSS; i++) {
    assert.ok(fought[i] > 0, `lazy never fought battle e${i + 1}`);
    const rate = wins[i] / fought[i];
    assert.ok(rate >= 0.9, `lazy won e${i + 1} ${(rate * 100).toFixed(1)}%, wanted 90%`);
  }
});

test('Grumblejaw takes between 5 and 9 rounds for an average player', () => {
  const rounds = reachedBoss(average).map((r) => r.results[BOSS].rounds);
  const mean = rounds.reduce((s, v) => s + v, 0) / rounds.length;
  assert.ok(mean >= 5 && mean <= 9, `the boss averaged ${mean.toFixed(1)} rounds, wanted 5-9`);
});
