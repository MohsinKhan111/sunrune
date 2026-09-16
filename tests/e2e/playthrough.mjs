// The whole chapter, played in a browser by a bot that actually walks (F23, F10).
//
// The bot may only read the game and turn the text speed up; it moves with real arrow
// keys, fights with real presses and steps on the rune pads itself. It asks the game
// which tiles Pip can stand on and finds its own way through them, so a failure here
// means there is genuinely no route - a hole in the map, not a badly guessed corner.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const TILE = 16;
const game = (page, fn) => page.evaluate(fn);

// Where Pip is and whether she is still being driven by the player: one round trip,
// and the walker needs both on every step.
const probe = (page) => game(page, () => {
  const p = window.__sunrune.player();
  return p ? { x: p.x, y: p.y, map: p.map, ready: window.__sunrune.ready() } : null;
});

const scenes = (page) => game(page, () => window.__sunrune.scenes());

async function press(page, key, ms = 220) {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
}

async function face(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(180);
  await page.keyboard.up(key);
  await page.waitForTimeout(100);
}

async function snapshot(page) {
  return game(page, () => {
    const s = window.__sunrune.state();
    return {
      map: s.map,
      objective: s.objective ?? null,
      party: s.party.map((m) => `${m.id} LV${m.lv}`),
      items: s.items,
      keys: Object.keys(s.keyItems),
      flags: Object.keys(s.flags),
      stats: s.stats,
    };
  });
}

// Press through anything that is talking - or fighting - until the player has control.
async function settle(page, limit = 45000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return;
    await press(page, 'Enter', 200);
  }
  throw new Error('never got control of the player');
}

// One leg, in a straight-ish line. Stops the moment the game takes over or the map
// changes: pressing arrow keys at a dialogue box achieves nothing.
async function walkTo(page, tx, ty, { limit = 14000, tol = 8 } = {}) {
  const goal = { x: tx * TILE + 8, y: ty * TILE + 14 };
  const end = Date.now() + limit;
  let held = null;
  const hold = async (key) => {
    if (held === key) return;
    if (held) await page.keyboard.up(held);
    held = key;
    if (key) await page.keyboard.down(key);
  };

  let last = await probe(page);
  const startMap = last.map;
  let lastMoved = Date.now();
  let detour = null;
  let flip = 1;

  try {
    while (Date.now() < end) {
      const p = await probe(page);
      if (!p) throw new Error('no player to walk');
      if (p.map !== startMap || !p.ready) return;
      const dx = goal.x - p.x;
      const dy = goal.y - p.y;
      if (Math.abs(dx) <= tol && Math.abs(dy) <= tol) return;

      if (Math.hypot(p.x - last.x, p.y - last.y) > 0.6) {
        lastMoved = Date.now();
        last = p;
        if (detour && Date.now() > detour.until) detour = null;
      } else if (!detour && Date.now() - lastMoved > 500) {
        // Nudged into something. Slide along the other axis, alternating which way.
        const horizontal = Math.abs(dx) > Math.abs(dy);
        const key = horizontal
          ? (flip > 0 ? 'ArrowDown' : 'ArrowUp')
          : (flip > 0 ? 'ArrowRight' : 'ArrowLeft');
        detour = { key, until: Date.now() + 700 };
        flip = -flip;
        lastMoved = Date.now();
      }

      const straight = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft')
        : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
      await hold(detour && Date.now() < detour.until ? detour.key : straight);
      await page.waitForTimeout(90);
    }
  } finally {
    await hold(null);
    await page.waitForTimeout(100);
  }
}

// Walks to a tile by asking the game which tiles Pip can stand on and finding a way
// through them. Throws if there is no route at all - that would be a hole in the map.
async function routeTo(page, tx, ty, { limit = 70000 } = {}) {
  const grid = await game(page, () => window.__sunrune.grid());
  if (!grid) throw new Error('no map to walk on');
  const { w, h, walk } = grid;
  const here = await probe(page);
  const sx = Math.round((here.x - 8) / TILE);
  const sy = Math.round((here.y - 14) / TILE);
  const key = (x, y) => y * w + x;
  const open = (x, y) => x >= 0 && y >= 0 && x < w && y < h && walk[key(x, y)] === 1;

  // Breadth-first, so the first route found is the shortest. The tile Pip stands on and
  // the one being aimed at are always allowed even if they read as blocked: doorways
  // and shop counters often do.
  const from = new Map([[key(sx, sy), null]]);
  const queue = [[sx, sy]];
  let found = sx === tx && sy === ty;
  while (queue.length && !found) {
    const [x, y] = queue.shift();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (from.has(key(nx, ny))) continue;
      const isGoal = nx === tx && ny === ty;
      if (!open(nx, ny) && !isGoal) continue;
      from.set(key(nx, ny), [x, y]);
      if (isGoal) {
        found = true;
        break;
      }
      queue.push([nx, ny]);
    }
  }
  if (!found) throw new Error(`no way from ${sx},${sy} to ${tx},${ty} on ${here.map}`);

  const trail = [];
  for (let cur = [tx, ty]; cur; cur = from.get(key(cur[0], cur[1]))) trail.push(cur);
  trail.reverse();

  // Only the corners matter; the walker handles the straight bits.
  const corners = trail.filter((p, i) => {
    if (i === 0 || i === trail.length - 1) return true;
    const a = trail[i - 1];
    const b = trail[i + 1];
    return !(a[0] === b[0] || a[1] === b[1]);
  });

  const end = Date.now() + limit;
  for (const [cx, cy] of corners.slice(1)) {
    if (Date.now() > end) throw new Error(`ran out of time walking to ${tx},${ty}`);
    const before = await probe(page);
    if (!before?.ready) return;
    await walkTo(page, cx, cy);
    const after = await probe(page);
    if (!after || !after.ready || after.map !== before.map) return;
  }
  const done = await probe(page);
  const off = Math.hypot(done.x - (tx * TILE + 8), done.y - (ty * TILE + 14));
  if (done.ready && done.map === here.map && off > 22) {
    throw new Error(`could not reach ${tx},${ty} on ${here.map} - stopped ${Math.round(off)}px short`);
  }
}

// Walk somewhere, dealing with whatever interrupts on the way - a roaming enemy, a
// trigger, a line of dialogue - and then carrying on. The canyon in particular will not
// let anyone cross it undisturbed.
async function travel(page, tx, ty, { tries = 8 } = {}) {
  for (let i = 0; i < tries; i++) {
    await settle(page, 150000);
    const before = await probe(page);
    try {
      await routeTo(page, tx, ty);
    } catch (err) {
      if (i === tries - 1) throw err;
      continue;
    }
    const p = await probe(page);
    if (!p) throw new Error('lost the player');
    if (p.map !== before.map) return;
    if (!p.ready) continue;
    const off = Math.hypot(p.x - (tx * TILE + 8), p.y - (ty * TILE + 14));
    if (off <= 22) return;
  }
  throw new Error(`could not get to ${tx},${ty}`);
}

// Roughly how long this would take a person, with the text at normal speed.
function readingSeconds() {
  const src = fs.readFileSync(path.join(process.cwd(), 'src', 'story', 'chapter1.js'), 'utf8');
  let chars = 0;
  for (const re of [/'((?:[^'\\\n]|\\.)*)'/g, /"((?:[^"\\\n]|\\.)*)"/g]) {
    let m;
    while ((m = re.exec(src))) {
      const s = m[1];
      if (/\s/.test(s) && /[a-zA-Z]/.test(s) && !s.includes('/')) chars += s.length;
    }
  }
  return chars / 55; // "normal" text speed, in characters per second
}

export const chapter = [
  {
    name: 'plays-the-whole-chapter',
    query: 'test=1',
    async run({ page, shot }) {
      const began = Date.now();
      let step = 0;
      const mark = async (name) => {
        step += 1;
        // Never shoot through the battle wipe. Enemies roam, so one can start a fight
        // on the exact frame a mark lands, and the wipe is a gold ellipse over the
        // whole screen - a real part of the game, but it hides the thing the shot is
        // evidence of. Waiting it out costs a second at most.
        for (let i = 0; i < 8; i++) {
          if (!(await scenes(page)).includes('SwirlScene')) break;
          await page.waitForTimeout(150);
        }
        await shot(`chapter-${String(step).padStart(2, '0')}-${name}`);
      };

      // ---- the opening ----
      await mark('title');
      await press(page, 'Enter', 700);
      await press(page, 'Enter', 1200);
      // Text at full speed: allowed, and the only way this finishes in a sane time.
      await game(page, () => {
        window.__sunrune.G.settings.textSpeed = 'instant';
      });
      await settle(page);
      await mark('wake-up');
      let s = await snapshot(page);
      assert.equal(s.map, 'house', `the intro ended on ${s.map}`);

      // ---- the satchel ----
      await routeTo(page, 4, 4);
      await face(page, 'ArrowUp');
      await press(page, 'Enter', 500);
      await settle(page);
      s = await snapshot(page);
      assert.ok(s.keys.includes('satchel'), 'never picked up the satchel');
      await mark('satchel');

      // ---- out to Dunmere ----
      await routeTo(page, 5, 8);
      await page.waitForTimeout(1600);
      s = await snapshot(page);
      assert.equal(s.map, 'dunmere', `the front door led to ${s.map}`);
      await mark('dunmere');

      // ---- Tilly and the compass ----
      await routeTo(page, 34, 8);
      await page.waitForTimeout(1600);
      s = await snapshot(page);
      assert.equal(s.map, 'post', `the Post Office door led to ${s.map}`);
      await routeTo(page, 3, 6);
      await face(page, 'ArrowUp');
      await press(page, 'Enter', 500);
      for (let i = 0; i < 16; i++) {
        if ((await scenes(page)).includes('ShopScene')) break;
        await press(page, 'Enter', 240);
      }
      if ((await scenes(page)).includes('ShopScene')) {
        await mark('tillys-shop');
        await press(page, 'Escape', 500);
      }
      await settle(page);
      s = await snapshot(page);
      assert.ok(s.keys.includes('rune_compass'), 'Tilly never handed over the compass');
      await mark('rune-compass');

      // ---- Biscuit, and the scrap that makes him join ----
      await routeTo(page, 6, 9);
      await page.waitForTimeout(1600);
      await routeTo(page, 33, 22);
      await settle(page, 120000);
      s = await snapshot(page);
      assert.ok(s.flags.includes('biscuit_joined'), 'Biscuit never joined');
      assert.equal(s.party.length, 2, 'the party should be two by now');
      await mark('biscuit-joined');

      // ---- east to Glass Canyon ----
      await travel(page, 43, 14);
      await page.waitForTimeout(1800);
      s = await snapshot(page);
      assert.equal(s.map, 'canyon', `the east road led to ${s.map}`);
      await mark('glass-canyon');

      // ---- the canyon: a shard, then the key that opens the mining yard ----
      await travel(page, 9, 28);
      await face(page, 'ArrowUp');
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 600);

      await travel(page, 52, 10);
      await face(page, 'ArrowUp');
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 600);
      await settle(page, 60000);
      s = await snapshot(page);
      assert.ok(s.keys.includes('chain_key'), 'never found the Chain Key');
      await mark('chain-key');

      // The yard is padlocked, so the second shard is unreachable until it turns.
      await travel(page, 46, 26);
      await face(page, 'ArrowDown');
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 650);
      await settle(page, 60000);
      s = await snapshot(page);
      assert.ok(s.flags.includes('unlocked:yard_gate'), 'the mining yard is still locked');
      await mark('yard-gate');

      await travel(page, 48, 30);
      await face(page, 'ArrowUp');
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 600);
      await settle(page, 60000);
      s = await snapshot(page);
      assert.ok(s.keys.includes('sun_shard'), 'the canyon chests gave no Sun Shards');
      await mark('sun-shards');

      // ---- the Cinder Twins are sitting on the third ----
      await travel(page, 30, 31);
      await settle(page, 200000);
      s = await snapshot(page);
      assert.ok(s.flags.includes('calmed:canyon:e6'), 'the Cinder Twins are still there');
      await mark('cinder-twins');

      // ---- the golden door ----
      await travel(page, 42, 14);
      await face(page, 'ArrowUp');
      for (let i = 0; i < 4; i++) await press(page, 'Enter', 700);
      await settle(page, 60000);
      s = await snapshot(page);
      assert.equal(s.map, 'hollow', `the golden door led to ${s.map}`);
      await mark('the-hollow');

      // ---- the rune pads: sunrise, sun, moon ----
      // Each pad's trigger is a 26px box inset into it, so row 14 leaves Pip's feet a
      // pixel below the edge. Row 13 is squarely inside, and the second, tighter walk
      // plants her on the pad rather than near it.
      for (const [px, py] of [[19, 13], [23, 13], [27, 13]]) {
        await travel(page, px, py);
        await walkTo(page, px, py, { limit: 6000, tol: 4 });
        await settle(page, 60000);
      }
      s = await snapshot(page);
      assert.ok(s.flags.includes('pads_done'), 'the rune pads never opened the door');
      await mark('rune-pads');

      // ---- Grumblejaw, and straight on into the ending ----
      // The boss trigger is a one-tile band on row 7; row 8 leaves Pip below it.
      // Not travel() here: its retry loop settles, and settling would press straight
      // through the fight, the ending and the title into a brand new game. routeTo stops
      // the moment the game takes over, which is exactly when the trigger fires.
      await routeTo(page, 21, 7).catch(() => {});
      await walkTo(page, 21, 7, { limit: 6000, tol: 4 });

      // From here the game takes over and never gives control back - the fight runs into
      // the walk home, the letter and the credits, and then the title. So watch for the
      // ending rather than waiting to be handed the keys again. If the party loses, the
      // defeat screen starts on "Try again", so pressing on simply fights it again.
      let beatenBoss = false;
      let sawFight = false;
      let sawLetter = false;
      const until = Date.now() + 420000;
      while (Date.now() < until) {
        const now = await scenes(page);
        if (now.includes('EndingScene')) break;
        if (!sawFight && now.includes('BattleScene')) {
          sawFight = true;
          await mark('boss-fight');
        }
        if (!sawLetter && now.includes('LetterScene')) {
          sawLetter = true;
          await mark('letter-from-future-pip');
        }
        if (!beatenBoss) {
          const now = await snapshot(page);
          if (now.flags.includes('boss_done')) {
            beatenBoss = true;
            await mark('grumblejaw');
          }
        }
        await press(page, 'Enter', 300);
      }
      assert.ok(beatenBoss, 'Grumblejaw was never beaten');
      assert.ok((await scenes(page)).includes('EndingScene'), 'never reached the ending');
      // The loop breaks on the ending's first frame, which is still under the fade. Give
      // the card a moment to come up, or the shot is a black rectangle. Nothing is
      // pressed while waiting, so it cannot skip past the card.
      await page.waitForTimeout(1600);
      await mark('ending');
      const cleared = await game(page, () => window.localStorage.getItem('sunrune:cleared'));
      assert.equal(cleared, '1', 'the chapter was never marked as cleared');

      const mins = ((Date.now() - began) / 60000).toFixed(1);
      console.log(`       bot played the whole chapter in ${mins} min; the dialogue adds about ${Math.round(readingSeconds() / 60)} min at normal text speed`);
    },
  },
];
