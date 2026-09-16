// Drives the game with real key presses and reports what happened.
// node tests/e2e/drive.mjs <outDir> "<query>" "cmd,cmd,..."
//
// Commands: hold:Key:ms · press:Key · wait:ms · shot:name · where · dialogue · scenes
//           tp:map:tileX:tileY  (jump Pip there)
// Example: "hold:ArrowLeft:800,press:Enter,wait:400,dialogue,shot:talk"
import path from 'node:path';
import { open } from './browser.mjs';

// A fourth argument sets the window size, e.g. 1920x1080 - the display step has to be
// checked at real resolutions, not just the default one.
const [outDir = '.', query = 'test=1', script = '', size = ''] = process.argv.slice(2);
const [vw, vh] = /^\d+x\d+$/.test(size) ? size.split('x').map(Number) : [1280, 720];
const { page, errors, close } = await open({ query, width: vw, height: vh });

const evalGame = (fn) => page.evaluate(fn).catch((e) => `error: ${e.message}`);

try {
  await page.waitForTimeout(1200);
  for (const cmd of script.split(',').map((s) => s.trim()).filter(Boolean)) {
    const [name, a, b, c] = cmd.split(':');
    if (name === 'tp') {
      await page.evaluate(([m, x, y]) => window.__sunrune.teleport(m, Number(x), Number(y)), [a, b, c]);
      await page.waitForTimeout(250);
      continue;
    }
    if (name === 'hold') {
      await page.keyboard.down(a);
      await page.waitForTimeout(Number(b ?? 300));
      await page.keyboard.up(a);
      await page.waitForTimeout(60);
    } else if (name === 'press') {
      await page.keyboard.press(a);
      await page.waitForTimeout(Number(b ?? 250));
    } else if (name === 'auto') {
      // Press through a battle. Stops early on the defeat screen so it isn't dismissed.
      const end = Date.now() + Number(a ?? 5000);
      while (Date.now() < end) {
        // Stop on the defeat screen so it isn't dismissed, but keep going through the
        // victory sequence (EXP and level ups come after the result is decided).
        const st = await evalGame(() => window.__sunrune.battle?.());
        if (st && st.phase === 'defeat') break;
        if (!st) break;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(Number(b ?? 380));
      }
    } else if (name === 'settle') {
      // Press through cutscenes and dialogue until the player has control again.
      const end = Date.now() + Number(a ?? 20000);
      let ready = false;
      while (Date.now() < end) {
        ready = await evalGame(() => window.__sunrune.ready?.());
        if (ready === true) break;
        await page.keyboard.press('Enter');
        await page.waitForTimeout(Number(b ?? 260));
      }
      console.log(`settle ${ready === true ? 'ready' : 'TIMED OUT'}`);
    } else if (name === 'goto') {
      // Navigate within the same browser context, so localStorage survives. A fresh
      // run starts with empty storage, so this is the only way to prove a save persists
      // across a reload and can be loaded from the title.
      const url = new URL(page.url());
      url.search = a ?? '';
      await page.goto(url.href, { waitUntil: 'load' });
      await page.waitForTimeout(Number(b ?? 1600));
      console.log(`goto ${url.search}`);
    } else if (name === 'until') {
      // Press through dialogue until a named scene is on the stack, then stop - so a
      // capture can land exactly on a screen instead of guessing at press counts.
      const end = Date.now() + Number(b ?? 15000);
      let found = false;
      while (Date.now() < end) {
        const stack = await evalGame(() => window.__sunrune.scenes());
        if (Array.isArray(stack) && stack.includes(a)) {
          found = true;
          break;
        }
        await page.keyboard.press('Enter');
        await page.waitForTimeout(Number(c ?? 300));
      }
      console.log(`until ${a} ${found ? 'reached' : 'TIMED OUT'}`);
    } else if (name === 'actors') {
      console.log('actors', JSON.stringify(await evalGame(() => window.__sunrune.actors())));
    } else if (name === 'levels') {
      // Sample the master bus over time: an instantaneous reading can land in a rest,
      // so this is what actually shows whether a song has silent gaps.
      const stats = await page.evaluate(async (ms) => {
        const vals = [];
        const end = performance.now() + ms;
        while (performance.now() < end) {
          vals.push(window.__sunrune.audio().level);
          await new Promise((r) => setTimeout(r, 25));
        }
        let run = 0;
        let worst = 0;
        for (const v of vals) {
          run = v <= 0.0005 ? run + 1 : 0;
          worst = Math.max(worst, run);
        }
        const round = (n) => Math.round(n * 1000) / 1000;
        return {
          samples: vals.length,
          min: round(Math.min(...vals)),
          max: round(Math.max(...vals)),
          mean: round(vals.reduce((a, b) => a + b, 0) / vals.length),
          longestSilenceMs: worst * 25,
        };
      }, Number(a ?? 3000));
      console.log('levels', JSON.stringify(stats));
    } else if (name === 'aud') {
      console.log('audio', JSON.stringify(await evalGame(() => window.__sunrune.audio())));
    } else if (name === 'parts') {
      console.log('parts', JSON.stringify(await evalGame(() => window.__sunrune.parts())));
    } else if (name === 'untilmsg') {
      // Wait for a battle message to appear, then carry on straight away. The victory
      // sequence advances on timers, so this lands on the beat instead of guessing.
      const end = Date.now() + Number(b ?? 20000);
      let seen = false;
      while (Date.now() < end) {
        const st = await evalGame(() => window.__sunrune.battle?.());
        if (st && typeof st.msg === 'string' && st.msg.includes(a)) {
          seen = true;
          break;
        }
        await page.waitForTimeout(60);
      }
      console.log(`untilmsg "${a}" ${seen ? 'seen' : 'TIMED OUT'}`);
    } else if (name === 'amb') {
      console.log('ambient', JSON.stringify(await evalGame(() => window.__sunrune.ambient())));
    } else if (name === 'mouse') {
      // Moving the pointer, to show the cursor comes back after it has hidden itself.
      await page.mouse.move(Number(a ?? 100), Number(b ?? 100));
      await page.waitForTimeout(Number(c ?? 200));
    } else if (name === 'disp') {
      console.log('screen', JSON.stringify(await evalGame(() => window.__sunrune.screen())));
    } else if (name === 'fight') {
      console.log('fight', JSON.stringify(await evalGame(() => window.__sunrune.battle?.())));
    } else if (name === 'wait') {
      await page.waitForTimeout(Number(a));
    } else if (name === 'shot') {
      const file = path.join(outDir, `${a}.png`);
      await page.screenshot({ path: file });
      console.log(`shot ${file}`);
    } else if (name === 'where') {
      console.log('where', JSON.stringify(await evalGame(() => window.__sunrune.player())));
    } else if (name === 'dialogue') {
      console.log('dialogue', JSON.stringify(await evalGame(() => window.__sunrune.dialogue())));
    } else if (name === 'scenes') {
      console.log('scenes', JSON.stringify(await evalGame(() => window.__sunrune.scenes())));
    } else if (name === 'st') {
      console.log(
        'state',
        JSON.stringify(
          await evalGame(() => {
            const s = window.__sunrune.state();
            return {
              map: s.map,
              objective: s.objective ?? null,
              party: s.party.map((m) => `${m.id} LV${m.lv} ${m.hp}hp ${m.sp}sp`),
              items: s.items,
              keys: Object.keys(s.keyItems),
              dollars: s.dollars,
              flags: Object.keys(s.flags),
              stats: s.stats,
            };
          }),
        ),
      );
    } else {
      console.log(`unknown command ${cmd}`);
    }
  }
  if (errors.length) {
    console.log(`CONSOLE ERRORS:\n  ${errors.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('no console errors');
  }
} finally {
  await close();
}
