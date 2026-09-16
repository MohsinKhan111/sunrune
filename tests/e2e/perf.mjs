// What a frame costs, in the two busiest places in the game (Step 50): the canyon,
// where the wind, the tumbleweeds and the sand streaks all run at once over a scrolling
// map, and the boss fight, where the shake, the sparks and the rolling HP meters do.
//
// Budget: update + render under 6 ms a frame. At 60 fps a frame is 16.7 ms, so 6 ms
// leaves the browser two thirds of every frame for its own work - compositing, audio,
// garbage collection - which is the margin that keeps the game smooth on a slow laptop
// rather than only on this one.
//
// Measured through the game's own loop, not a synthetic benchmark, and while something
// is actually happening: a still screen with nobody moving is not what anyone plays.
import assert from 'node:assert/strict';

const game = (page, fn) => page.evaluate(fn);

// Start a fresh measuring window, do something for `ms`, then read the cost back.
// Resetting first matters: a number averaged over the loading screen and the first
// frame of a map says nothing about how the canyon runs.
async function measure(page, ms, during) {
  await game(page, () => window.__sunrune.perf(true));
  const done = during(page);
  await page.waitForTimeout(ms);
  await done;
  return game(page, () => window.__sunrune.perf());
}

function report(label, p) {
  console.log(
    `       ${label}: ${p.total} ms a frame (update ${p.update}, render ${p.render}), ` +
      `worst ${p.worst} ms, ${p.fps} fps over ${p.frames} frames`,
  );
}

async function settle(page, limit = 30000) {
  const end = Date.now() + limit;
  while (Date.now() < end) {
    if ((await game(page, () => window.__sunrune.ready?.())) === true) return;
    await page.keyboard.press('Enter');
    await page.waitForTimeout(240);
  }
  throw new Error('never got control of the player');
}

export const perf = [
  {
    // Level 4 and two in the party, because that is how the canyon is actually reached.
    name: 'the-canyon-at-full-tilt',
    query: 'map=canyon&party2&lv=4&test=1',
    async run({ page }) {
      await settle(page);
      // Give the ambient life a few seconds to fill up before measuring - it spawns over
      // time, so measuring immediately would measure an empty canyon.
      await page.waitForTimeout(4000);
      const alive = await game(page, () => window.__sunrune.ambient());
      assert.ok(
        alive.weeds + alive.streaks + alive.flies > 0,
        `nothing is moving in the canyon, so this measures the wrong thing: ${JSON.stringify(alive)}`,
      );

      const p = await measure(page, 6000, async (pg) => {
        // Walking keeps the camera scrolling, which redraws every tile every frame.
        for (const key of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
          await pg.keyboard.down(key);
          await pg.waitForTimeout(1400);
          await pg.keyboard.up(key);
        }
      });
      report('canyon', p);
      assert.ok(p.frames > 120, `only ${p.frames} frames went by; that is too few to trust`);
      assert.ok(p.total < 6, `a canyon frame costs ${p.total} ms, over the 6 ms budget`);
    },
  },

  {
    name: 'the-boss-fight-at-full-tilt',
    query: 'battle=grumblejaw&lv=4&party2&test=1',
    async run({ page }) {
      for (let i = 0; i < 40; i++) {
        if ((await game(page, () => window.__sunrune.battle()))) break;
        await page.waitForTimeout(250);
      }
      assert.ok(await game(page, () => window.__sunrune.battle()), 'the boss fight never started');

      const p = await measure(page, 8000, async (pg) => {
        // Attacking keeps the animations, the timed-hit ring, the damage numbers and the
        // rolling meters going for the whole window.
        for (let i = 0; i < 26; i++) {
          await pg.keyboard.press('Enter');
          await pg.waitForTimeout(300);
        }
      });
      report('boss fight', p);
      assert.ok(p.frames > 160, `only ${p.frames} frames went by; that is too few to trust`);
      assert.ok(p.total < 6, `a boss-fight frame costs ${p.total} ms, over the 6 ms budget`);
    },
  },
];
