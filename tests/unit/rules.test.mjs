import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statsAt, levelForExp, expToNext, skillsAt, baseDamage, damage, timingGrade, timingLandMs,
  timingMultiplier, guardGrade, guardMultiplier, turnOrder, runChance, rewards, applyExp, rollHp,
} from '../../src/battle/rules.js';
import { makeRng } from '../../src/engine/rng.js';
import { ENEMIES } from '../../src/data/enemies.js';

test('stats at level follow base + growth', () => {
  assert.deepEqual(statsAt('pip', 1), { hp: 38, sp: 10, atk: 7, def: 4, spd: 7 });
  assert.deepEqual(statsAt('pip', 4), { hp: 62, sp: 19, atk: 13, def: 7, spd: 10 });
  assert.deepEqual(statsAt('biscuit', 1), { hp: 32, sp: 14, atk: 6, def: 3, spd: 6 });
  assert.deepEqual(statsAt('biscuit', 3), { hp: 46, sp: 22, atk: 10, def: 5, spd: 8 });
});

test('EXP table: 0/12/35/70/120/190, capped at LV6', () => {
  assert.equal(levelForExp(0), 1);
  assert.equal(levelForExp(11), 1);
  assert.equal(levelForExp(12), 2);
  assert.equal(levelForExp(34), 2);
  assert.equal(levelForExp(35), 3);
  assert.equal(levelForExp(70), 4);
  assert.equal(levelForExp(120), 5);
  assert.equal(levelForExp(190), 6);
  assert.equal(levelForExp(9999), 6);
  assert.equal(expToNext(1, 5), 7);
  assert.equal(expToNext(6, 500), 0);
});

test('skills are learned at their level', () => {
  assert.deepEqual(skillsAt('pip', 1), ['pounce']);
  assert.deepEqual(skillsAt('pip', 3), ['pounce', 'lick_wounds']);
  assert.deepEqual(skillsAt('pip', 4), ['pounce', 'lick_wounds', 'sunburst']);
  assert.deepEqual(skillsAt('biscuit', 1), ['wrench_toss', 'patch_kit']);
  assert.deepEqual(skillsAt('biscuit', 3), ['wrench_toss', 'patch_kit', 'spark_coil']);
});

test('damage: base = atk×2 − def (min 1), × power × variance, rounded, min 1', () => {
  assert.equal(baseDamage(7, 2), 12);
  assert.equal(baseDamage(1, 50), 1);
  assert.equal(damage(7, 2, 1, 0.85), 10);
  assert.equal(damage(7, 2, 1, 1.15), 14);
  assert.equal(damage(1, 50, 0.1, 0.85), 1);
});

test('Pip LV1 Bash on a Glimmerslug does 10-14', () => {
  const rng = makeRng(42);
  const pip = statsAt('pip', 1);
  for (let i = 0; i < 2000; i++) {
    const d = damage(pip.atk, ENEMIES.glimmerslug.def, 1, rng.range(0.85, 1.15));
    assert.ok(d >= 10 && d <= 14, `got ${d}`);
  }
});

test('timed hits: PERFECT ±60 ms of 900, GOOD ±150, relaxed doubles', () => {
  assert.equal(timingGrade(null), 'none');
  assert.equal(timingGrade(900), 'perfect');
  assert.equal(timingGrade(840), 'perfect');
  assert.equal(timingGrade(960), 'perfect');
  assert.equal(timingGrade(839), 'good');
  assert.equal(timingGrade(750), 'good');
  assert.equal(timingGrade(1050), 'good');
  assert.equal(timingGrade(749), 'early');
  assert.equal(timingGrade(100), 'early');
  assert.equal(timingGrade(780, true), 'perfect');
  assert.equal(timingGrade(600, true), 'good');
  assert.equal(timingGrade(599, true), 'early');
  assert.equal(timingLandMs(), 1050);
  assert.equal(timingLandMs(true), 1200);
  assert.equal(timingMultiplier('perfect'), 1.5);
  assert.equal(timingMultiplier('good'), 1.25);
  assert.equal(timingMultiplier('early'), 1);
});

test('guarding: window 250-500 ms (relaxed 100-500), ×0.6, Guard ×0.5, both ×0.3', () => {
  assert.equal(guardGrade(null), 'none');
  assert.equal(guardGrade(249), 'early');
  assert.equal(guardGrade(250), 'block');
  assert.equal(guardGrade(500), 'block');
  assert.equal(guardGrade(501), 'none');
  assert.equal(guardGrade(100, true), 'block');
  assert.equal(guardGrade(99, true), 'early');
  assert.equal(guardMultiplier(true, false), 0.6);
  assert.equal(guardMultiplier(false, true), 0.5);
  assert.ok(Math.abs(guardMultiplier(true, true) - 0.3) < 1e-9);
  assert.equal(guardMultiplier(false, false), 1);
});

test('turn order: faster first; exact ties put the party first, Pip before Biscuit', () => {
  const same = () => 0.5;
  same.range = () => 1;
  const order = turnOrder(
    [
      { key: 'slug', spd: 7, side: 'enemy', index: 0 },
      { key: 'biscuit', spd: 7, side: 'party', index: 1 },
      { key: 'pip', spd: 7, side: 'party', index: 0 },
      { key: 'moth', spd: 10, side: 'enemy', index: 1 },
    ],
    same,
  );
  assert.deepEqual(order.map((a) => a.key), ['moth', 'pip', 'biscuit', 'slug']);
});

test('run chance is 0.5 + 0.08 × speed difference, clamped 0.2-0.95', () => {
  assert.equal(runChance([7], [7]), 0.5);
  assert.ok(Math.abs(runChance([10], [3]) - 0.95) < 1e-9);
  assert.ok(Math.abs(runChance([3], [10]) - 0.2) < 1e-9);
  assert.ok(Math.abs(runChance([7, 6], [10]) - 0.22) < 1e-9);
  assert.ok(Math.abs(runChance([8], [6]) - 0.66) < 1e-9);
});

test('rewards add up EXP and sand dollars', () => {
  const r = rewards([ENEMIES.glimmerslug, ENEMIES.dune_moth], () => 0.99);
  assert.equal(r.exp, 13);
  assert.equal(r.dollars, 8);
  assert.deepEqual(r.drops, []);
  const lucky = rewards([ENEMIES.glimmerslug], () => 0.01);
  assert.deepEqual(lucky.drops, ['cactus_candy']);
});

test('levelling up restores HP and SP and reports new skills', () => {
  const m = { id: 'pip', lv: 1, exp: 0, hp: 3, sp: 0 };
  const ups = applyExp(m, 36);
  assert.equal(m.lv, 3);
  assert.equal(m.exp, 36);
  assert.equal(ups.length, 2);
  assert.equal(m.hp, statsAt('pip', 3).hp);
  assert.equal(m.sp, statsAt('pip', 3).sp);
  assert.deepEqual(ups[0].learned, ['lick_wounds']);
  assert.deepEqual(ups[1].learned, []);
  const none = applyExp(m, 1);
  assert.equal(none.length, 0);
});

test('rolling HP: down 16/s, up 48/s, never past the real value', () => {
  assert.equal(rollHp(40, 20, 0.5), 32);
  assert.equal(rollHp(40, 39, 0.5), 39);
  assert.equal(rollHp(10, 40, 0.5), 34);
  assert.equal(rollHp(30, 40, 1), 40);
  assert.equal(rollHp(25, 25, 1), 25);
});
