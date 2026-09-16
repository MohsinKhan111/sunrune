// Local web server for playing SUNRUNE. No dependencies.
// Listens on 127.0.0.1 and never serves anything outside the project folder (D21).
//
// `--lan` is the one way past that, and it is never the default: it opens the same
// server to the other devices on this Wi-Fi so a phone or tablet can play it (D27).
// It is still only this folder, still read-only, and still nothing to do with the
// internet - but anyone on the same network can reach it while it runs.
import http from 'node:http';
import os from 'node:os';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LOCAL_HOST = '127.0.0.1';
const LAN_HOST = '0.0.0.0';
const DEFAULT_PORT = Number(process.env.PORT) || 8765;
const PORT_TRIES = 11;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.ogg': 'audio/ogg',
  '.ico': 'image/x-icon',
  '.svg': 'image/svg+xml',
};

// Maps a request path to a file inside root, or null if it would land outside it.
export function resolveSafe(root, urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(String(urlPath).split(/[?#]/)[0]);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const relative = decoded.replace(/^[/\\]+/, '') || 'index.html';
  const full = path.resolve(root, relative);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

async function handle(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }
  const file = resolveSafe(ROOT, req.url || '/');
  if (!file) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  try {
    const info = await stat(file);
    if (!info.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Content-Length': body.length,
      'Cache-Control': 'no-store',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
  }
}

function listen(port, host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handle);
    server.once('error', reject);
    server.listen(port, host, () => resolve(server));
  });
}

// This machine's addresses on the local network, for the "open this on your phone" line.
// Only IPv4, and never the loopback one: a phone cannot use 127.0.0.1.
export function lanAddresses(nets = os.networkInterfaces()) {
  const out = [];
  for (const list of Object.values(nets)) {
    for (const net of list ?? []) {
      const v4 = net.family === 'IPv4' || net.family === 4;
      if (v4 && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// Starts the server on the first free port from `port` upwards.
export async function startServer({ port = DEFAULT_PORT, lan = false } = {}) {
  const host = lan ? LAN_HOST : LOCAL_HOST;
  for (let p = port; p < port + PORT_TRIES; p++) {
    try {
      const server = await listen(p, host);
      return { server, port: p, lan, url: `http://localhost:${p}/` };
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(`ports ${port}-${port + PORT_TRIES - 1} are all in use`);
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]]
    : process.platform === 'darwin' ? ['open', [url]]
    : ['xdg-open', [url]];
  const child = spawn(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => console.log(`Open ${url} in your browser.`));
  child.unref();
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const lan = process.argv.includes('--lan');
  startServer({ lan })
    .then(({ url, port }) => {
      console.log(`SUNRUNE running at ${url}`);
      if (lan) {
        const addresses = lanAddresses();
        console.log('');
        if (addresses.length) {
          console.log('On a phone or tablet on the same Wi-Fi, open:');
          for (const ip of addresses) console.log(`    http://${ip}:${port}/`);
        } else {
          console.log("This computer isn't on a network, so there is no address to share.");
        }
        console.log('');
        console.log('While this window is open, anyone on this Wi-Fi can read this folder.');
        console.log('Close it when you are done playing.');
      }
      console.log('Close this window (or press Ctrl+C) to stop.');
      if (process.argv.includes('--open')) openBrowser(url);
    })
    .catch((err) => {
      console.error(`Couldn't start the SUNRUNE server: ${err.message}`);
      process.exit(1);
    });
}
