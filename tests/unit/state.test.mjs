import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newGame, addItem, removeItem, itemCount, giveKey, takeKey, hasKey, addDollars,
  setFlag, flag, toSave, fromSave, restoreParty, makeMember,
} from '../../src/story/state.js';

test('a new game: Pip LV1 with 38/38 HP, 10/10 SP and 20 sand dollars', () => {
  const s = newGame();
  assert.equal(s.party.length, 1);
  assert.deepEqual(s.party[0], { id: 'pip', lv: 1, exp: 0, hp: 38, sp: 10 });
  assert.equal(s.dollars, 20);
  assert.deepEqual(s.items, {});
});

test('items stack to 9 and never go over', () => {
  const s = newGame();
  assert.equal(addItem(s, 'cactus_candy', 8), true);
  assert.equal(addItem(s, 'cactus_candy', 2), false);
  assert.equal(itemCount(s, 'cactus_candy'), 8);
  assert.equal(addItem(s, 'cactus_candy', 1), true);
  assert.equal(addItem(s, 'cactus_candy', 1), false);
  assert.equal(itemCount(s, 'cactus_candy'), 9);
  assert.equal(removeItem(s, 'cactus_candy', 9), true);
  assert.equal(itemCount(s, 'cactus_candy'), 0);
  assert.equal(removeItem(s, 'cactus_candy'), false);
  assert.throws(() => addItem(s, 'not_a_thing'));
});

test('key items can be counted and used up', () => {
  const s = newGame();
  giveKey(s, 'sun_shard');
  giveKey(s, 'sun_shard');
  assert.equal(hasKey(s, 'sun_shard', 2), true);
  assert.equal(hasKey(s, 'sun_shard', 3), false);
  assert.equal(takeKey(s, 'sun_shard', 2), true);
  assert.equal(hasKey(s, 'sun_shard'), false);
  assert.equal(takeKey(s, 'chain_key'), false);
});

test('sand dollars stay between 0 and 9999', () => {
  const s = newGame();
  assert.equal(addDollars(s, 10000), 9999);
  assert.equal(addDollars(s, -20000), 0);
});

test('saves round-trip exactly', () => {
  const s = newGame();
  s.map = 'canyon';
  s.x = 312;
  s.y = 208;
  s.party.push(makeMember('biscuit', 3));
  addItem(s, 'fizzy_dew', 2);
  giveKey(s, 'rune_compass');
  setFlag(s, 'biscuit_joined');
  s.stats.playMs = 412000;
  const back = fromSave(toSave(s));
  assert.ok(back.state);
  assert.equal(back.state.map, 'canyon');
  assert.equal(back.state.x, 312);
  assert.deepEqual(back.state.party, s.party);
  assert.deepEqual(back.state.items, { fizzy_dew: 2 });
  assert.equal(flag(back.state, 'biscuit_joined'), true);
  assert.equal(back.state.stats.playMs, 412000);
});

test('saves from another version, or broken ones, are refused', () => {
  const s = newGame();
  s.x = 1;
  s.y = 1;
  const other = JSON.parse(toSave(s));
  other.v = 2;
  assert.deepEqual(fromSave(JSON.stringify(other)), { error: 'old' });
  assert.deepEqual(fromSave('{nope'), { error: 'broken' });
  assert.deepEqual(fromSave('{"v":1}'), { error: 'broken' });
  assert.deepEqual(fromSave('null'), { error: 'broken' });
});

test('writing a letter home restores everyone, even knocked-flat members', () => {
  const s = newGame();
  s.party.push(makeMember('biscuit', 2));
  s.party[0].hp = 0;
  s.party[1].sp = 1;
  restoreParty(s);
  assert.equal(s.party[0].hp, 38);
  assert.equal(s.party[1].sp, 18);
});
