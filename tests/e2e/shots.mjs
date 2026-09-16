// Several screenshots in one browser session, for checking things by eye.
// node tests/e2e/shots.mjs <outDir> "<query>" "<query>" ...   → <outDir>/1.png, 2.png, ...
import path from 'node:path';
import { open } from './browser.mjs';

const [outDir, ...queries] = process.argv.slice(2);
const { page, errors, base, close } = await open({ query: queries[0] });
try {
  for (let i = 0; i < queries.length; i++) {
    if (i > 0) await page.goto(`${base}?${queries[i]}`);
    await page.waitForTimeout(1200);
    const file = path.join(outDir, `${i + 1}.png`);
    await page.screenshot({ path: file });
    console.log(`saved ${file}  (${queries[i]})`);
  }
  if (errors.length) {
    console.log(`CONSOLE ERRORS:\n  ${errors.join('\n  ')}`);
    process.exitCode = 1;
  }
} finally {
  await close();
}
