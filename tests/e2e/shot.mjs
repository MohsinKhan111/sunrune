// Screenshot helper for checking things by eye.
// node tests/e2e/shot.mjs "<query>" <out.png> [--wait=ms] [--size=1280x720] [--keys=Enter,wait:500,ArrowRight*10]
import { open } from './browser.mjs';

const [query = '', out = 'tests/screenshots/shot.png', ...rest] = process.argv.slice(2);
const opt = Object.fromEntries(rest.map((a) => a.replace(/^--/, '').split('=')));
const [width, height] = (opt.size ?? '1280x720').split('x').map(Number);

const { page, errors, logs, close } = await open({ query, width, height });
try {
  await page.waitForTimeout(Number(opt.wait ?? 800));
  for (const k of (opt.keys ?? '').split(',').filter(Boolean)) {
    if (k.startsWith('wait:')) {
      await page.waitForTimeout(Number(k.slice(5)));
      continue;
    }
    const [key, times = '1'] = k.split('*');
    for (let i = 0; i < Number(times); i++) {
      await page.keyboard.press(key);
      await page.waitForTimeout(40);
    }
  }
  if (opt.after) await page.waitForTimeout(Number(opt.after));
  await page.screenshot({ path: out });
  console.log(`saved ${out}`);
  if (opt.logs) for (const l of logs) console.log(l);
  if (errors.length) {
    console.log('CONSOLE ERRORS:');
    for (const e of errors) console.log('  ' + e);
    process.exitCode = 1;
  }
} finally {
  await close();
}
