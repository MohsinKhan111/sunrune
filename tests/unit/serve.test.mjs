import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { resolveSafe, ROOT, lanAddresses, startServer } from '../../tools/serve.mjs';

test('the server maps paths inside the project folder', () => {
  assert.equal(resolveSafe(ROOT, '/'), path.join(ROOT, 'index.html'));
  assert.equal(resolveSafe(ROOT, '/assets/tiles.png?x=1'), path.join(ROOT, 'assets', 'tiles.png'));
  assert.equal(resolveSafe(ROOT, '/src/main.js#top'), path.join(ROOT, 'src', 'main.js'));
});

test('the server refuses anything outside the project folder (D21)', () => {
  for (const p of [
    '/../package.json',
    '/%2e%2e/package.json',
    '/..%5cpackage.json',
    '/%2e%2e%2f%2e%2e%2fWindows/win.ini',
    '/C:/Windows/win.ini',
    '/src/../../x',
    '/%zz',
    '/a%00b',
  ]) {
    assert.equal(resolveSafe(ROOT, p), null, p);
  }
});

test('the phone address list skips loopback and anything that is not IPv4 (D27)', () => {
  const nets = {
    'Wi-Fi': [
      { family: 'IPv4', address: '192.168.1.24', internal: false },
      { family: 'IPv6', address: 'fe80::1', internal: false },
    ],
    'Loopback': [{ family: 'IPv4', address: '127.0.0.1', internal: true }],
    'Down': undefined,
  };
  // 127.0.0.1 is the one address a phone certainly cannot use, so printing it would
  // send the player off to try the address that is guaranteed not to work.
  assert.deepEqual(lanAddresses(nets), ['192.168.1.24']);
});

test('the server stays on this computer unless it is asked not to (D21)', async () => {
  const { server, lan } = await startServer({ port: 18321 });
  try {
    assert.equal(lan, false, 'the default grew a network');
    assert.equal(server.address().address, '127.0.0.1');
  } finally {
    server.close();
  }
});
