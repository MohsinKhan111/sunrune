// What the game downloads against what it plays (F19). Everything in SOUNDS is fetched
// and decoded before the loading bar finishes, so a name left in the list after nothing
// plays it any more costs every player time for nothing - and a name played but missing
// from the list is a sound that silently never happens. Both directions matter, and
// neither shows up by ear.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { SOUNDS, IMAGES } from '../../src/engine/assets.js';

const ROOT = process.cwd();
const SRC = path.join(ROOT, 'src');

// Every .js under src/ except the asset list itself, which is the thing being checked.
function sources() {
  const out = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (full.endsWith('.js') && !full.endsWith(path.join('engine', 'assets.js'))) out.push(full);
    }
  })(SRC);
  return out.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
}

const code = sources();
// Sound names are always written out in full. Nothing assembles one from pieces, and if
// something ever did, these checks would not see it - so keep them literal.
const played = new Set([...code.matchAll(/'([a-z]+-[a-z])'/g)].map((m) => m[1]));

test('every sound the game downloads is one it actually plays', () => {
  const idle = SOUNDS.filter((name) => !played.has(name));
  assert.deepEqual(idle, [], `downloaded but never played: ${idle.join(', ')}`);
});

test('every sound the game plays is one it downloaded', () => {
  const missing = [...played].filter((name) => !SOUNDS.includes(name));
  assert.deepEqual(missing, [], `played but never downloaded, so silent: ${missing.join(', ')}`);
});

test('every file the game asks for is on disk', () => {
  for (const name of SOUNDS) {
    const file = path.join(ROOT, 'assets', 'sfx', `${name}.ogg`);
    assert.ok(fs.existsSync(file), `assets/sfx/${name}.ogg is in the list but not in the folder`);
  }
  for (const [key, rel] of Object.entries(IMAGES)) {
    assert.ok(fs.existsSync(path.join(ROOT, rel)), `${key} points at ${rel}, which is not there`);
  }
});

test('the download before the game starts stays small', () => {
  // A phone on mobile data waits for all of this before the title screen. The pack's
  // full set of sounds is a little over 300 KB; the game has no business shipping the
  // ones it does not use.
  const bytes = SOUNDS.reduce((sum, name) => sum + fs.statSync(path.join(ROOT, 'assets', 'sfx', `${name}.ogg`)).size, 0);
  const kb = Math.round(bytes / 1024);
  assert.ok(kb <= 220, `${kb} KB of sound is downloaded before the game can start`);
});
