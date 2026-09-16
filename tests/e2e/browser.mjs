// Launches the installed Chrome (or Edge) with playwright-core. No browser download (D17).
import { chromium } from 'playwright-core';
import { existsSync } from 'node:fs';
import { startServer } from '../../tools/serve.mjs';

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);

export async function launch({ headless = true } = {}) {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error('No Chrome or Edge found. Set CHROME_PATH.');
  return chromium.launch({
    executablePath,
    headless,
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
}

// Starts the game server and a browser page. Collects console errors.
// `touch` makes it a phone or tablet instead of a desktop window: a coarse pointer, a
// real touchscreen and a dense screen, which is what the pad decides on (F40).
export async function open({ query = '', width = 1280, height = 720, touch = false, dpr = touch ? 2 : 1 } = {}) {
  const { server, port } = await startServer({ port: 19000 + Math.floor(Math.random() * 500) });
  const browser = await launch();
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: dpr,
    hasTouch: touch,
    isMobile: touch,
  });
  const page = await context.newPage();
  const errors = [];
  const logs = [];
  page.on('console', (m) => {
    logs.push(`[${m.type()}] ${m.text()}`);
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));
  const base = `http://localhost:${port}/`;
  await page.goto(base + (query ? `?${query}` : ''));
  const close = async () => {
    await browser.close();
    server.close();
  };
  return { page, errors, logs, base, close, browser, context };
}
