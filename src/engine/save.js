// Saving (F17): one slot, in localStorage, never written without being asked first.
// What a save contains and whether one can be trusted live in story/state.js, which is
// pure and unit-tested. This file only deals with storage - the part that fails.
import { toSave, fromSave } from '../story/state.js';

export const KEYS = {
  save: 'sunrune:save:1',
  settings: 'sunrune:settings',
  cleared: 'sunrune:cleared',
};

export const SAVE_FAILED = "Couldn't write the letter - your browser is blocking saves.";
export const SAVE_OLD = 'This letter is from an older version of the game.';

// localStorage throws in a private window and where a browser blocks site data, so
// every call in the game goes through these two.
function read(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  return read(KEYS.save) !== null;
}

// Notes where Pip is standing, then writes. Returns false if the browser refused, so
// the caller can say so rather than pretending it worked.
export function saveGame(state, world) {
  if (world) {
    state.map = world.mapId;
    state.x = Math.round(world.player.x);
    state.y = Math.round(world.player.y);
    state.facing = world.player.facing;
  }
  return write(KEYS.save, toSave(state));
}

// Returns { state } or { error: 'none' | 'old' | 'broken' }.
export function loadGame() {
  const json = read(KEYS.save);
  if (json === null) return { error: 'none' };
  return fromSave(json);
}

export function markCleared() {
  return write(KEYS.cleared, '1');
}

// Only from Settings, and only behind a confirmation (F3). Nothing else deletes a save.
export function eraseSave() {
  try {
    window.localStorage.removeItem(KEYS.save);
    return true;
  } catch {
    return false;
  }
}
