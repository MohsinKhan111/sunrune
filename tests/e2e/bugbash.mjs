// The bug bash (Step 51), as checks rather than a checklist: every door, every map edge,
// every NPC twice, every menu on the keyboard alone, mashing confirm and cancel on every
// screen, resizing mid-battle, fullscreen mid-dialogue, and losing each kind of fight.
//
// Some of it is done exhaustively from the map data instead of by walking, on purpose: a
// person walking into edges finds the edge they thought to try, while reading every
// border tile finds the one nobody would think to try.
import assert from 'node:assert/strict';
import { MAPS } from '../../src/world/maps/index.js';
import { npcs } from '../../src/story/chapter1.js';

const game = (page, fn, arg) => page.evaluate(fn, arg);
const scenes = (page) => game(page, () => window.__sunrune.scenes());

async function press(page, key, ms = 240) {
  await page.keyboard.press(key);
  await page.waitForTimeout(ms);
}

async function face(page, key) {
  await page.keyboard.down(key);
  await page.waitForTimeout(180);
  await page.keyboard.up(key);
  await page.waitForTimeout(120);
}

async function settle(page, limit = 30000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return;
    await press(page, 'Enter', 220);
  }
  throw new Error('never got control of the player');
}

async function goto(page, map, tx, ty) {
  await game(page, ([m, x, y]) => window.__sunrune.teleport(m, x, y), [map, tx, ty]);
  await page.waitForTimeout(500);
}

// Press out of whatever a conversation opened, and back to walking about. Enter alone is
// not enough: Tilly's counter is a conversation that ends in a shop, and confirm in a
// shop buys things rather than leaving. Whichever key gets out, use that one.
async function pressBackToPlaying(page, limit = 40) {
  for (let i = 0; i < limit; i++) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return true;
    const open = await scenes(page);
    const stuck = ['ShopScene', 'MenuScene', 'SettingsScene'].some((s) => open.includes(s));
    await press(page, stuck ? 'Escape' : 'Enter', 260);
  }
  return (await game(page, () => window.__sunrune.ready?.())) === true;
}

// Which tiles a map's exits cover - the only places its border is allowed to be open.
function exitTiles(def) {
  const open = new Set();
  for (const o of def.objects ?? []) {
    if (o.type !== 'exit') continue;
    for (let y = o.y; y < o.y + (o.h ?? 1); y++) {
      for (let x = o.x; x < o.x + (o.w ?? 1); x++) open.add(`${x},${y}`);
    }
  }
  return open;
}

// Every way out of a map that the data declares: plain exits and the doors set into
// buildings both name a map and a spawn on it.
function doorsOf(def) {
  const out = [];
  for (const o of def.objects ?? []) {
    if (o.type === 'exit' && o.to) out.push({ where: `exit at ${o.x},${o.y}`, to: o.to, spawn: o.spawn });
    if (o.type === 'building' && o.door?.to) {
      out.push({ where: `the door of ${o.id}`, to: o.door.to, spawn: o.door.spawn });
    }
  }
  return out;
}

// Walk into the nearest enemy and wait for the fight to start.
async function startAFight(page, limit = 30000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if (await game(page, () => window.__sunrune.battle())) return;
    const at = await game(page, () => {
      const w = window.__sunrune.world;
      const e = w.actors.find((a) => a.constructor.name === 'EnemyWalker');
      return e ? { tx: Math.round((e.x - 8) / 16), ty: Math.round((e.y - 14) / 16) } : null;
    });
    if (!at) throw new Error('there is nothing on this map to lose to');
    await goto(page, null, at.tx, at.ty);
    await page.waitForTimeout(700);
  }
  throw new Error('no enemy would start a fight');
}

// Put the party on the floor and let the fight finish them, leaving the defeat screen up.
async function goDown(page) {
  await game(page, () => {
    const b = window.__sunrune.G.stack.find((s) => s.constructor.name === 'BattleScene');
    for (const p of b.party) {
      p.hp = 1;
      p.shown = 1;
    }
  });
  for (let i = 0; i < 140; i++) {
    const b = await game(page, () => window.__sunrune.battle());
    if (!b) break;
    if (b.phase === 'defeat') return;
    await press(page, 'Enter', 300);
  }
  throw new Error('the party never went down, even on 1 HP each');
}

export const bugbash = [
  {
    // Every door names a map and a spawn; every spawn is somewhere a character can
    // stand. A door to a misspelt map, or one that lands you inside a wall, is exactly
    // the kind of thing that survives a playthrough that never happens to use it.
    name: 'every-door-leads-somewhere-you-can-stand',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      const problems = [];
      for (const [id, def] of Object.entries(MAPS)) {
        for (const d of doorsOf(def)) {
          const target = MAPS[d.to];
          if (!target) {
            problems.push(`${id}: ${d.where} leads to "${d.to}", which is not a map`);
            continue;
          }
          if (d.spawn && !target.spawns?.[d.spawn]) {
            problems.push(`${id}: ${d.where} asks for spawn "${d.spawn}", which ${d.to} does not have`);
          }
        }
      }
      assert.deepEqual(problems, [], `\n${problems.join('\n')}`);

      // Now the walkability of every spawn, read from the game's own collision test.
      const bad = [];
      for (const [id, def] of Object.entries(MAPS)) {
        for (const [name, sp] of Object.entries(def.spawns ?? {})) {
          await goto(page, id, Math.floor(sp.x), Math.floor(sp.y));
          const stuck = await game(page, () => {
            const w = window.__sunrune.world;
            return w.blocked(w.player, w.player.x, w.player.y);
          });
          if (stuck) bad.push(`${id} spawn "${name}" at ${sp.x},${sp.y} is inside something solid`);
        }
      }
      assert.deepEqual(bad, [], `\n${bad.join('\n')}`);
    },
  },

  {
    // Every tile of every map's border must be solid, except the ones an exit covers.
    // This is the whole edge of every map, not the four corners somebody remembered.
    name: 'no-map-can-be-walked-out-of',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      const holes = [];
      for (const [id, def] of Object.entries(MAPS)) {
        await goto(page, id, 2, 2);
        const grid = await game(page, () => window.__sunrune.grid());
        assert.ok(grid, `no walkability grid for ${id}`);
        assert.equal(grid.w, def.ground[0].length, `${id}: the grid is a different width to the map`);
        const open = exitTiles(def);
        const walkable = (x, y) => grid.walk[y * grid.w + x] === 1;
        for (let x = 0; x < grid.w; x++) {
          for (const y of [0, grid.h - 1]) {
            if (walkable(x, y) && !open.has(`${x},${y}`)) holes.push(`${id}: ${x},${y}`);
          }
        }
        for (let y = 0; y < grid.h; y++) {
          for (const x of [0, grid.w - 1]) {
            if (walkable(x, y) && !open.has(`${x},${y}`)) holes.push(`${id}: ${x},${y}`);
          }
        }
      }
      assert.deepEqual(holes, [], `\nthese border tiles are open and no exit covers them:\n${holes.join('\n')}`);
    },
  },

  {
    // Talk to everyone twice. The second line is the one that breaks: a script that ends
    // without closing its box, or a one-shot that runs again and hands out a second copy
    // of something, only shows on the way back round.
    name: 'every-npc-talks-twice',
    query: 'map=dunmere&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      const state = await game(page, () => window.__sunrune.state());
      const silent = [];
      for (const map of ['house', 'post', 'dunmere', 'canyon']) {
        for (const n of npcs(map, state)) {
          for (const round of [1, 2]) {
            // Half of these wander, so aim at where the character is now rather than
            // where the map put them: standing one tile below and looking up, which is
            // where a player would be.
            await goto(page, map, n.x, n.y + 1);
            let line = '';
            for (let go = 0; go < 3 && !line.trim(); go++) {
              // The canyon has enemies walking about, and one can pick a fight on the way
              // over. Finish whatever is going on before trying to start a conversation,
              // or the Enter that was meant for the NPC goes into a battle menu.
              await pressBackToPlaying(page, 60);
              const at = await game(page, (id) => {
                const a = window.__sunrune.world.actors.find((q) => q.id === id);
                return a ? { tx: Math.round((a.x - 8) / 16), ty: Math.round((a.y - 14) / 16) } : null;
              }, n.id);
              if (!at) break;
              await goto(page, map, at.tx, at.ty + 1);
              await face(page, 'ArrowUp');
              await press(page, 'Enter', 600);
              line = String(await game(page, () => window.__sunrune.dialogue() ?? ''));
            }
            if (!line.trim()) silent.push(`${map}: ${n.id} said nothing on go ${round}`);
            if (!(await pressBackToPlaying(page))) {
              silent.push(`${map}: ${n.id} never gave control back on go ${round}`);
            }
          }
        }
      }
      assert.deepEqual(silent, [], `\n${silent.join('\n')}`);
    },
  },

  {
    // The whole pause menu on the keyboard alone: every tab, an item used on a real
    // character, the settings panel and every row in it, and out again. No mouse exists
    // in this game, so anything only reachable by luck is unreachable.
    // Nana's house, not the canyon: the canyon has enemies walking about, and a fight
    // starting halfway through would be testing something else.
    name: 'every-menu-works-on-the-keyboard-alone',
    query: 'map=house&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      await game(page, () => {
        const s = window.__sunrune.state();
        // One kind of item, and a healing one, so "the first thing in the list" is a
        // thing that can actually be used on somebody.
        s.items = { cactus_candy: 2 };
        s.party[0].hp = 5;
      });

      await press(page, 'Escape', 500);
      assert.ok((await scenes(page)).includes('MenuScene'), 'Escape did not open the menu');

      // Down the tabs and back up, so both directions and the wrap are exercised.
      for (let i = 0; i < 5; i++) await press(page, 'ArrowDown', 200);
      for (let i = 0; i < 5; i++) await press(page, 'ArrowUp', 200);

      // Items → use one on Pip, who is on 5 HP.
      await press(page, 'Enter', 350);
      await press(page, 'Enter', 350);
      await press(page, 'Enter', 700);
      for (let i = 0; i < 3; i++) await press(page, 'Enter', 300);
      const hp = await game(page, () => window.__sunrune.state().party[0].hp);
      assert.ok(hp > 5, `using an item from the menu healed nothing; Pip is still on ${hp}`);

      // Back to the tabs, then Party and Journal, which only have to draw without dying.
      await press(page, 'Escape', 300);
      await press(page, 'ArrowDown', 250);
      await press(page, 'Enter', 400);
      await press(page, 'ArrowDown', 250);
      await press(page, 'Escape', 300);
      await press(page, 'ArrowDown', 250);
      await press(page, 'Enter', 400);
      await press(page, 'Escape', 300);

      // Settings: every row, moved both ways.
      await press(page, 'ArrowDown', 250);
      await press(page, 'Enter', 500);
      assert.ok((await scenes(page)).includes('SettingsScene'), 'Settings did not open');
      for (let i = 0; i < 8; i++) {
        await press(page, 'ArrowRight', 160);
        await press(page, 'ArrowLeft', 160);
        await press(page, 'ArrowDown', 160);
      }
      await press(page, 'Escape', 500);
      assert.ok(!(await scenes(page)).includes('SettingsScene'), 'Escape did not close Settings');

      // Quit to Title asks first, and must start on "No".
      await press(page, 'ArrowDown', 250);
      await press(page, 'Enter', 400);
      await press(page, 'Enter', 600);
      assert.ok(
        !(await scenes(page)).includes('TitleScene'),
        'the quit question threw the game away on the first Enter',
      );

      // All the way out. Escape, not Enter: inside a menu, confirm picks things.
      for (let i = 0; i < 4; i++) await press(page, 'Escape', 300);
      assert.equal(await pressBackToPlaying(page), true, 'Escape never closed the menu');
    },
  },

  {
    // Mash confirm and cancel everywhere. Nothing here asserts a nice outcome - the point
    // is that no screen throws, and that the game is still playable afterwards.
    name: 'mashing-confirm-and-cancel-breaks-nothing',
    query: 'test=1',
    async run({ page }) {
      const mash = async (times) => {
        for (let i = 0; i < times; i++) {
          await page.keyboard.press(i % 3 === 2 ? 'Escape' : 'Enter');
          await page.waitForTimeout(60);
        }
      };

      await mash(20); // the title, and straight through the menu into a new game
      await page.waitForTimeout(1200);
      await mash(40); // the opening cutscene
      await settle(page, 60000);

      await press(page, 'Escape', 400);
      await mash(30); // the pause menu, at whatever depth that left it
      for (let i = 0; i < 5; i++) await press(page, 'Escape', 250);
      await settle(page, 20000);

      const s = await scenes(page);
      assert.ok(s.includes('Overworld'), `mashing left the game on ${s.join(' > ')}`);
      const moved = await game(page, () => {
        const p = window.__sunrune.world.player;
        return { x: p.x, y: p.y };
      });
      await page.keyboard.down('ArrowDown');
      await page.waitForTimeout(700);
      await page.keyboard.up('ArrowDown');
      const after = await game(page, () => {
        const p = window.__sunrune.world.player;
        return { x: p.x, y: p.y };
      });
      assert.notDeepEqual(after, moved, 'the game stopped taking input after the mashing');
    },
  },

  {
    // The window can change size at any moment, and F is on the keyboard during dialogue
    // as much as anywhere else. Both used to be the kind of thing nobody tries until a
    // player does.
    name: 'resizing-mid-battle-and-fullscreen-mid-dialogue',
    query: 'battle=grumblejaw&lv=4&party2&test=1',
    async run({ page }) {
      for (let i = 0; i < 40; i++) {
        if (await game(page, () => window.__sunrune.battle())) break;
        await page.waitForTimeout(250);
      }
      assert.ok(await game(page, () => window.__sunrune.battle()), 'the boss fight never started');

      for (const [w, h] of [[640, 360], [1000, 500], [1281, 723], [480, 800], [1280, 720]]) {
        await page.setViewportSize({ width: w, height: h });
        await page.waitForTimeout(400);
        const sc = await game(page, () => window.__sunrune.screen());
        assert.ok(sc.scale >= 1, `the scale fell to ${sc.scale} at ${w}x${h}`);
        // Whole-number scaling from ×2 up; under that D10 says a window narrower than
        // 640 falls back to a fractional scale rather than sitting in a huge border.
        if (sc.scale >= 2) {
          assert.equal(sc.scale, Math.floor(sc.scale), `the scale went fractional (${sc.scale}) at ${w}x${h}`);
        }
        assert.ok(sc.ox >= 0 && sc.oy >= 0, `the picture sits outside the window at ${w}x${h}`);
        assert.ok(
          sc.scale * 320 <= sc.w && sc.scale * 180 <= sc.h,
          `the picture is bigger than the window at ${w}x${h}`,
        );
        assert.ok(await game(page, () => window.__sunrune.battle()), `the fight died at ${w}x${h}`);
      }
    },
  },

  {
    // Nana rather than Tilly: Tilly's conversation ends at a shop counter, and this is
    // about the dialogue box surviving a display change, not about the shop.
    name: 'fullscreen-during-dialogue',
    query: 'map=house&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      await goto(page, 'house', 5, 5);
      await face(page, 'ArrowUp');
      await press(page, 'Enter', 700);
      const before = String(await game(page, () => window.__sunrune.dialogue() ?? ''));
      assert.ok(before.trim(), 'Nana said nothing, so there is no dialogue to interrupt');
      await press(page, 'KeyF', 700);
      await press(page, 'KeyF', 700);
      // The line must still be there, and pressing on must still work.
      const after = String(await game(page, () => window.__sunrune.dialogue() ?? ''));
      assert.ok(after.trim(), 'the dialogue box vanished when fullscreen was toggled');
      assert.equal(
        await pressBackToPlaying(page),
        true,
        'never got control back after toggling fullscreen mid-conversation',
      );
    },
  },

  {
    // Losing, in the real game rather than through a debug route, and both ways out of
    // it. This is the path players take most and tests take least.
    name: 'losing-a-fight-in-the-world-and-both-ways-out',
    query: 'map=canyon&party2&lv=1&test=1',
    async run({ page }) {
      await settle(page);
      await startAFight(page);

      // First way out: Try again, which puts the fight back on with the party as it was
      // when the fight started - not the 1 HP they lost on.
      await goDown(page);
      await press(page, 'Enter', 1500);
      const again = await game(page, () => window.__sunrune.battle());
      assert.ok(again, 'Try again did not put the fight back on');
      assert.ok(
        !/ 1\//.test(again.party[0]),
        `Try again started the party on the health they lost with: ${again.party[0]}`,
      );

      // Second way out: back to the last letter, which patches everyone up where they
      // stand rather than actually rewinding to the save.
      await goDown(page);
      await press(page, 'ArrowDown', 400);
      await press(page, 'Enter', 3000);
      // Not waiting for control here: the party goes down standing on top of the enemy
      // that beat them, so the next fight can start the moment they are back on their
      // feet. What matters is that the fight ended and nobody was left on the floor.
      for (let i = 0; i < 20; i++) {
        if (!(await scenes(page)).includes('BattleScene')) break;
        await press(page, 'Enter', 300);
      }
      assert.ok(
        (await scenes(page)).includes('Overworld'),
        `the defeat did not put the game back in the world: ${(await scenes(page)).join(' > ')}`,
      );
      const party = await game(page, () => window.__sunrune.state().party.map((m) => `${m.hp}/${m.maxHp ?? m.hp}`));
      const hurt = await game(page, () =>
        window.__sunrune.state().party.filter((m) => m.hp <= 1).map((m) => m.id),
      );
      assert.deepEqual(hurt, [], `the party was left on the floor after the defeat: ${party.join(', ')}`);
    },
  },

  {
    // The boss can be lost too, and the same defeat screen has to appear for it. The
    // debug route ends at the title whichever option is taken, so what is checked here is
    // that losing to Grumblejaw offers both ways out and then leaves the fight.
    name: 'losing-to-the-boss-offers-a-way-out',
    query: 'battle=grumblejaw&lv=4&party2&test=1',
    async run({ page }) {
      for (let i = 0; i < 40; i++) {
        if (await game(page, () => window.__sunrune.battle())) break;
        await page.waitForTimeout(250);
      }
      assert.ok(await game(page, () => window.__sunrune.battle()), 'the boss fight never started');
      await goDown(page);
      const options = await game(page, () => {
        const b = window.__sunrune.G.stack.find((s) => s.constructor.name === 'BattleScene');
        return b?.defeat?.options ?? null;
      });
      assert.deepEqual(options, ['Try again', 'Back to your last letter'], 'the defeat screen offered no way out');
      await press(page, 'ArrowDown', 400);
      await press(page, 'Enter', 2000);
      assert.ok(
        !(await scenes(page)).includes('BattleScene'),
        'choosing a way out of the boss fight left the fight running',
      );
    },
  },
];
