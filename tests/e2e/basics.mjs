// The basics, in a real browser (F23): does it boot, can you start a game, pick things
// up, write home and come back to it, and do your settings stick. Console errors fail a
// check on their own - the runner checks for them after every one.
import assert from 'node:assert/strict';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const game = (page, fn) => page.evaluate(fn);

// The game's state, flattened the same way the driver reports it, so a check can read
// "keys" and "flags" as lists rather than picking through the live object.
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
      dollars: s.dollars,
    };
  });
}

async function press(page, key, ms = 260) {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
}

// Face a direction without walking anywhere in particular.
async function face(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(200);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

// Presses through cutscenes and dialogue until the player has control again.
async function settle(page, limit = 40000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return;
    await press(page, 'Enter', 240);
  }
  throw new Error('never got control of the player');
}

// Keep pressing until an expected line shows up. A question takes a different number of
// presses depending on how much of it has typed out, so counting presses is guesswork.
async function pressUntil(page, re, limit = 12) {
  for (let i = 0; i < limit; i++) {
    const line = String(await game(page, () => window.__sunrune.dialogue()));
    if (re.test(line)) return line;
    await press(page, 'Enter', 520);
  }
  const last = String(await game(page, () => window.__sunrune.dialogue()));
  throw new Error(`never saw ${re}; the box last said "${last}"`);
}

// Jump Pip somewhere, so a check doesn't spend twenty seconds walking.
async function tp(page, map, tx, ty) {
  await page.evaluate(([m, x, y]) => window.__sunrune.teleport(m, x, y), [map, tx, ty]);
  await page.waitForTimeout(260);
}

// Go somewhere else in the same browser, keeping localStorage - the only way to show
// that a save or a setting really survives a reload.
async function reopen(page, query) {
  const url = new URL(page.url());
  url.search = query;
  await page.goto(url.href, { waitUntil: 'load' });
  await page.waitForTimeout(1500);
}

async function startNewGame(page) {
  await press(page, 'Enter', 700); // title → menu
  await press(page, 'Enter', 1200); // New Game
  await settle(page);
}

export const basics = [
  {
    name: 'boots-to-the-title',
    async run({ page }) {
      const scenes = await game(page, () => window.__sunrune.scenes());
      assert.deepEqual(scenes, ['TitleScene'], `expected the title screen, got ${scenes}`);
    },
  },

  {
    name: 'new-game-reaches-nanas-house',
    async run({ page }) {
      await startNewGame(page);
      const s = await snapshot(page);
      assert.equal(s.map, 'house', `expected Nana's house, ended up on ${s.map}`);
      assert.equal(s.objective, 'Take your satchel');
      assert.equal(s.party.length, 1, 'Pip should start on her own');
    },
  },

  {
    name: 'the-satchel-can-be-taken',
    async run({ page }) {
      await startNewGame(page);
      await tp(page, 'house', 4, 4);
      await face(page, 'ArrowUp');
      await press(page, 'Enter', 700);
      await press(page, 'Enter', 600);
      const s = await snapshot(page);
      assert.ok(s.keys.includes('satchel'), `satchel not taken; carrying ${s.keys}`);
      assert.equal(s.objective, 'Visit Tilly at the Post Office');
    },
  },

  {
    name: 'a-letter-home-survives-a-reload',
    query: 'map=canyon&test=1',
    async run({ page }) {
      await settle(page);
      // Open a chest first, so there is something to lose if the save is no good.
      await tp(page, 'canyon', 35, 6);
      await face(page, 'ArrowUp');
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 650);

      const before = await snapshot(page);
      assert.ok(before.items.fizzy_dew, 'the chest gave nothing');

      // Write home at the Post Terminal.
      await tp(page, 'canyon', 44, 30);
      await face(page, 'ArrowUp');
      await press(page, 'Enter', 650);
      await pressUntil(page, /letter safe/);
      const where = await game(page, () => window.__sunrune.player());

      // Back to the title in the same browser, then Continue.
      await reopen(page, 'test=1');
      await press(page, 'Enter', 800); // menu
      await press(page, 'ArrowDown', 400); // Continue
      await press(page, 'Enter', 1400);
      await page.waitForTimeout(800);

      const after = await snapshot(page);
      const back = await game(page, () => window.__sunrune.player());
      assert.equal(after.map, 'canyon', 'Continue did not load the save');
      assert.equal(Math.round(back.x), Math.round(where.x), 'came back in the wrong place');
      assert.equal(Math.round(back.y), Math.round(where.y), 'came back in the wrong place');
      assert.deepEqual(after.items, before.items, 'the satchel came back different');
      assert.ok(after.flags.includes('chest:canyon_dew'), 'the opened chest was forgotten');
    },
  },

  {
    name: 'settings-survive-a-reload',
    async run({ page }) {
      await press(page, 'Enter', 700); // menu
      await press(page, 'ArrowDown', 320);
      await press(page, 'ArrowDown', 320); // Settings
      await press(page, 'Enter', 700);
      for (let i = 0; i < 3; i++) await press(page, 'ArrowRight', 280); // music 60 → 90
      const set = await game(page, () => window.__sunrune.G.settings.music);
      assert.equal(set, 90, `music volume did not move, it is ${set}`);

      await reopen(page, 'test=1');
      const kept = await game(page, () => window.__sunrune.G.settings.music);
      assert.equal(kept, 90, `music volume came back as ${kept}`);
    },
  },

  {
    // The debug routes read the address bar, and the address bar is the one input a
    // player can get wrong - or be sent wrong by somebody else. A name that is not a map
    // or an enemy used to throw on the way in: the map route left a half-built world
    // behind, and the battle route sat on the loading screen for good. Both now land on
    // the title, which is somewhere you can actually play from.
    name: 'a-bad-address-lands-on-the-title-instead-of-breaking',
    query: 'test=1',
    async run({ page, base }) {
      for (const query of ['map=nowhere', 'battle=notanenemy', 'battle=', 'map=&debug=world']) {
        await page.goto(`${base}?${query}&test=1`);
        await page.waitForTimeout(2200);
        const scenes = await game(page, () => window.__sunrune.scenes());
        assert.deepEqual(scenes, ['TitleScene'], `?${query} left the game on ${scenes.join(' > ')}`);
      }
      // And a good address still works, which is what the rest of the suite relies on.
      await page.goto(`${base}?map=house&party2&lv=4&test=1`);
      await page.waitForTimeout(2200);
      assert.deepEqual(await game(page, () => window.__sunrune.scenes()), ['Overworld'], 'a valid map stopped working');
      await page.goto(`${base}?battle=glimmerslug,dune_moth&lv=3&test=1`);
      await page.waitForTimeout(2500);
      assert.ok(await game(page, () => window.__sunrune.battle()), 'a valid battle stopped working');
    },
  },

  {
    name: 'opening-the-file-directly-says-how-to-start-it',
    async run({ page }) {
      const file = pathToFileURL(path.join(process.cwd(), 'index.html')).href;
      await page.goto(file, { waitUntil: 'load' });
      await page.waitForTimeout(600);
      const body = await page.evaluate(() => document.body.innerText);
      assert.match(body, /Play\.bat/, 'the file:// warning never appeared');
    },
  },
];
