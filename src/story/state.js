// The player's game: party, items, money, story flags, stats. Pure data + helpers.
import { statsAt } from '../battle/rules.js';
import { EXP_TABLE } from '../data/party.js';
import { ITEMS, KEY_ITEMS, MAX_STACK, MAX_DOLLARS, START_DOLLARS } from '../data/items.js';

export const SAVE_VERSION = 1;

export function makeMember(id, lv = 1) {
  const s = statsAt(id, lv);
  return { id, lv, exp: EXP_TABLE[lv - 1], hp: s.hp, sp: s.sp };
}

export function newGame() {
  return {
    v: SAVE_VERSION,
    name: 'Pip',
    map: 'house',
    spawn: 'bed',
    x: null,
    y: null,
    facing: 1,
    party: [makeMember('pip', 1)],
    items: {},
    keyItems: {},
    dollars: START_DOLLARS,
    flags: {},
    stats: { playMs: 0, battlesWon: 0, chests: 0, secrets: 0 },
  };
}

export function itemCount(state, id) {
  return state.items[id] ?? 0;
}

// Adds n of an item. Returns false (and adds nothing) if it would go over 9.
export function addItem(state, id, n = 1) {
  if (!ITEMS[id]) throw new Error(`unknown item ${id}`);
  const have = itemCount(state, id);
  if (have + n > MAX_STACK) return false;
  state.items[id] = have + n;
  return true;
}

export function removeItem(state, id, n = 1) {
  const have = itemCount(state, id);
  if (have < n) return false;
  if (have === n) delete state.items[id];
  else state.items[id] = have - n;
  return true;
}

export function giveKey(state, id, n = 1) {
  if (!KEY_ITEMS[id]) throw new Error(`unknown key item ${id}`);
  state.keyItems[id] = (state.keyItems[id] ?? 0) + n;
}

export function takeKey(state, id, n = 1) {
  const have = state.keyItems[id] ?? 0;
  if (have < n) return false;
  if (have === n) delete state.keyItems[id];
  else state.keyItems[id] = have - n;
  return true;
}

export function hasKey(state, id, n = 1) {
  return (state.keyItems[id] ?? 0) >= n;
}

export function addDollars(state, n) {
  state.dollars = Math.max(0, Math.min(MAX_DOLLARS, state.dollars + n));
  return state.dollars;
}

export function flag(state, name) {
  return !!state.flags[name];
}

export function setFlag(state, name, value = true) {
  if (value) state.flags[name] = value;
  else delete state.flags[name];
}

export function member(state, id) {
  return state.party.find((m) => m.id === id) ?? null;
}

export function maxStats(m) {
  return statsAt(m.id, m.lv);
}

// Full HP and SP for everyone, including knocked-flat members (Post Terminals).
export function restoreParty(state) {
  for (const m of state.party) {
    const s = statsAt(m.id, m.lv);
    m.hp = s.hp;
    m.sp = s.sp;
  }
}

export function toSave(state) {
  const { spawn, ...rest } = state;
  return JSON.stringify({ ...rest, v: SAVE_VERSION });
}

// Returns { state } or { error: 'old' | 'broken' }.
export function fromSave(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return { error: 'broken' };
  }
  if (!data || typeof data !== 'object') return { error: 'broken' };
  if (data.v !== SAVE_VERSION) return { error: 'old' };
  const ok =
    typeof data.map === 'string' &&
    Number.isFinite(data.x) &&
    Number.isFinite(data.y) &&
    Array.isArray(data.party) &&
    data.party.length > 0 &&
    data.party.every((m) => typeof m.id === 'string' && Number.isFinite(m.lv) && Number.isFinite(m.hp)) &&
    data.items && typeof data.items === 'object' &&
    data.keyItems && typeof data.keyItems === 'object' &&
    Number.isFinite(data.dollars) &&
    data.flags && typeof data.flags === 'object' &&
    data.stats && typeof data.stats === 'object';
  if (!ok) return { error: 'broken' };
  return { state: { ...newGame(), ...data, spawn: null } };
}
