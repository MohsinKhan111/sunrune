// The browser test runner (F23). Starts the game's own server, drives the installed
// Chrome through each check, and leaves a screenshot of every one in tests/screenshots -
// they are there to be looked at, not just counted.
//
//   npm run test:e2e
//
// Each check gets its own browser and its own empty storage: several of them turn on a
// setting or write a save, and sharing one context would let them pass or fail by
// accident of the order they ran in.
import fs from 'node:fs';
import path from 'node:path';
import { basics } from './basics.mjs';
import { touchpad } from './touch.mjs';
import { chapter } from './playthrough.mjs';
import { perf } from './perf.mjs';
import { bugbash } from './bugbash.mjs';
import { open } from './browser.mjs';

// node tests/e2e/run.mjs [suite] [part of a check name]
const only = process.argv[2];
const onlyCheck = process.argv[3];
const SHOTS = path.join(process.cwd(), 'tests', 'screenshots');
fs.mkdirSync(SHOTS, { recursive: true });
const suites = [['basics', basics], ['touch', touchpad], ['chapter', chapter], ['perf', perf], ['bugbash', bugbash]];
const running = suites.filter(([name]) => !only || only === name);
if (!running.length) {
  console.log(`no suite called "${only}" - try ${suites.map(([n]) => n).join(", ")}`);
  process.exit(1);
}

// Clear out what this run is about to replace, so the folder always shows the last run
// and nothing else: old failures, and shots of a route that has since changed, only
// mislead whoever opens it. Only what this run replaces, though - re-running one suite
// should not throw away the evidence from the others.
const replaced = (f) =>
  running.some(
    ([name, checks]) =>
      f.startsWith(`${name}-`) ||
      checks.some((c) => f === `${c.name}.png` || f === `FAILED-${c.name}.png`),
  );
for (const f of fs.readdirSync(SHOTS)) {
  if (f.endsWith('.png') && replaced(f)) fs.rmSync(path.join(SHOTS, f));
}
let passed = 0;
const failures = [];
const started = Date.now();

for (const [suiteName, checks] of running) {
  for (const check of checks) {
    if (onlyCheck && !check.name.includes(onlyCheck)) continue;
    const label = `${suiteName} · ${check.name}`;
    // check.open lets a check ask for a window of its own - a phone rather than a
    // desktop, upright rather than sideways (F40).
    const ctx = await open({ query: check.query ?? 'test=1', ...(check.open ?? {}) });
    const shot = (name) => ctx.page.screenshot({ path: path.join(SHOTS, `${name}.png`) });
    const began = Date.now();
    try {
      await ctx.page.waitForTimeout(1200);
      await check.run({ ...ctx, shot });
      if (ctx.errors.length) throw new Error(`console errors: ${ctx.errors.join(' | ')}`);
      await shot(check.name);
      console.log(`  ok   ${label}  (${((Date.now() - began) / 1000).toFixed(1)}s)`);
      passed++;
    } catch (err) {
      await shot(`FAILED-${check.name}`).catch(() => {});
      console.log(`FAIL   ${label}\n       ${err.message}`);
      failures.push(label);
    } finally {
      await ctx.close();
    }
  }
}

const secs = ((Date.now() - started) / 1000).toFixed(1);
console.log(`\n${passed} passed, ${failures.length} failed in ${secs}s`);
console.log(`screenshots: ${path.relative(process.cwd(), SHOTS)}`);
if (failures.length) console.log(`failed: ${failures.join(', ')}`);
process.exit(failures.length ? 1 : 0);
