import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = name => readFile(new URL('../public/' + name, import.meta.url));
// IHDR only: sips writes RGB, so tests/helpers/png.js (which demands RGBA) does not apply here.
function pngSize(buffer) {
  assert.deepEqual([...buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  assert.equal(buffer.toString('ascii', 12, 16), 'IHDR');
  return `${buffer.readUInt32BE(16)}x${buffer.readUInt32BE(20)}`;
}

test('the manifest describes an installable app and every icon exists at its declared size', async () => {
  const manifest = JSON.parse(await read('manifest.webmanifest'));
  assert.equal(manifest.display, 'standalone');
  for (const key of ['start_url', 'scope']) assert.equal(manifest[key], './', `${key} must stay relative: the site lives in /anya-math/`);
  assert.ok(manifest.name && manifest.short_name);
  for (const size of ['192x192', '512x512']) {
    assert.ok(manifest.icons.some(icon => icon.sizes === size), `Chrome requires a ${size} icon to offer installation`);
  }
  assert.ok(manifest.icons.some(icon => icon.purpose === 'maskable'), 'Android crops to a circle without a maskable icon');
  for (const icon of manifest.icons) {
    assert.equal(pngSize(await read(icon.src.replace('./', ''))), icon.sizes, icon.src);
  }
  assert.equal(pngSize(await read('assets/icons/apple-touch-icon-180.png')), '180x180');
});

test('the page links the manifest, the iOS icon and the service worker', async () => {
  const html = (await read('index.html')).toString();
  assert.match(html, /<link rel="manifest" href="\.\/manifest\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\.\/assets\/icons\/apple-touch-icon-180\.png">/);
  assert.match(html, /id="install-dialog"/);
  assert.match((await read('js/app.js')).toString(), /navigator\.serviceWorker\.register\('\.\/sw\.js'\)/);
  assert.match((await read('sw.js')).toString(), /addEventListener\('fetch'/, 'Chrome only treats a worker with a fetch handler as installable');
});

test('the answer field is not a form, so browsers stop reading it as a sign-in', async () => {
  const html = (await read('index.html')).toString();
  assert.doesNotMatch(html, /<form/);
  assert.doesNotMatch(html, /type="submit"/);
  assert.match(html, /id="answer-input"[^>]*autocomplete="off"/);
});
