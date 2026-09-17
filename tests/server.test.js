import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('HTTP server serves the game and assets at root and the Pages subpath', { timeout: 10000 }, async t => {
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url))], {
    env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => child.kill());
  const base = await new Promise((resolve, reject) => {
    let output = '';
    child.on('error', reject);
    child.on('exit', code => reject(new Error(`Server exited before becoming ready: ${code}`)));
    child.stdout.on('data', chunk => {
      output += chunk;
      const address = output.match(/http:\/\/localhost:(\d+)\//);
      if (address) resolve(`http://127.0.0.1:${address[1]}`);
    });
  });
  for (const prefix of ['', '/anya-math']) {
    const page = await fetch(`${base}${prefix}/`);
    assert.equal(page.status, 200, `${prefix}/ must load`);
    assert.match(page.headers.get('content-type'), /^text\/html/);
    assert.match(await page.text(), /id="continue-game"/);
    for (const [asset, type] of [
      ['/js/app.js', 'text/javascript'], ['/css/styles.css', 'text/css'],
      ['/sw.js', 'text/javascript'], ['/manifest.webmanifest', 'application/manifest+json'],
      ['/assets/icons/icon-512.png', 'image/png'], ['/assets/icons/apple-touch-icon-180.png', 'image/png'],
      ...['idle', 'thinking', 'correct', 'almost', 'hint', 'levelComplete', 'noLives'].map(name => [`/assets/mascots/${name}.png`, 'image/png']),
    ]) {
      const response = await fetch(`${base}${prefix}${asset}`);
      assert.equal(response.status, 200, `${prefix}${asset} must load`);
      assert.ok(response.headers.get('content-type').startsWith(type));
      assert.ok((await response.arrayBuffer()).byteLength > 0);
    }
  }
  assert.equal((await fetch(`${base}/missing-file.js`)).status, 404);
  assert.equal((await fetch(`${base}/..%2fpackage.json`)).status, 403);
});
