import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GrumbleBrain, weightedMove, pickTarget } from '../../src/battle/ai.js';
import { makeRng } from '../../src/engine/rng.js';

test('Grumblejaw above half HP: chomp, tail sweep, belly rumble, rune burp, repeat', () => {
  const b = new GrumbleBrain();
  const rng = makeRng(1);
  const seq = Array.from({ length: 8 }, () => b.next(rng));
  assert.deepEqual(seq, [
    'chomp', 'tail_sweep', 'belly_rumble', 'rune_burp',
    'chomp', 'tail_sweep', 'belly_rumble', 'rune_burp',
  ]);
});

test('Grumblejaw at half HP gets grumpier once, then (chomp|tail) → rumble → burp', () => {
  const b = new GrumbleBrain();
  const rng = makeRng(7);
  b.next(rng);
  b.onHp(95, 190);
  assert.equal(b.raged, true);
  assert.equal(b.justRaged, true);
  const seq = Array.from({ length: 6 }, () => b.next(rng));
  assert.ok(['chomp', 'tail_sweep'].includes(seq[0]));
  assert.equal(seq[1], 'belly_rumble');
  assert.equal(seq[2], 'rune_burp');
  assert.ok(['chomp', 'tail_sweep'].includes(seq[3]));
  assert.equal(seq[4], 'belly_rumble');
  assert.equal(seq[5], 'rune_burp');
});

test('a rune burp always follows a belly rumble, even when rage starts in between', () => {
  const b = new GrumbleBrain();
  const rng = makeRng(3);
  b.next(rng);
  b.next(rng);
  assert.equal(b.next(rng), 'belly_rumble');
  b.onHp(90, 190);
  assert.equal(b.next(rng), 'rune_burp');
});

test('at a quarter HP he naps once on his next turn, then skips a turn waking up', () => {
  const b = new GrumbleBrain();
  const rng = makeRng(5);
  b.next(rng);
  b.onHp(40, 190);
  assert.equal(b.next(rng), 'grumpy_nap');
  assert.equal(b.asleep, true);
  assert.equal(b.next(rng), 'wake');
  assert.equal(b.asleep, false);
  b.onHp(10, 190);
  for (let i = 0; i < 12; i++) assert.notEqual(b.next(rng), 'grumpy_nap');
});

test('the nap waits for a pending rune burp', () => {
  const b = new GrumbleBrain();
  const rng = makeRng(9);
  b.next(rng);
  b.next(rng);
  b.next(rng);
  b.onHp(30, 190);
  assert.equal(b.next(rng), 'rune_burp');
  assert.equal(b.next(rng), 'grumpy_nap');
});

test('weighted moves follow their weights', () => {
  const rng = makeRng(11);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 10000; i++) counts[weightedMove([['a', 70], ['b', 30]], rng)]++;
  assert.ok(counts.a > 6700 && counts.a < 7300, JSON.stringify(counts));
});

test('targets are never knocked flat', () => {
  const rng = makeRng(2);
  const party = [{ id: 'pip', flat: true }, { id: 'biscuit', flat: false }];
  for (let i = 0; i < 50; i++) assert.equal(pickTarget(party, rng).id, 'biscuit');
  assert.equal(pickTarget([{ id: 'pip', flat: true }], rng), null);
});
