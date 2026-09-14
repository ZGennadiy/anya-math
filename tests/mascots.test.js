import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { JSDOM } from 'jsdom';
import { MASCOTS, renderMascot } from '../public/js/mascots.js';
import { decodeRgbaPng } from './helpers/png.js';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('../public/assets/mascots/manifest.json', import.meta.url), 'utf8'));

for (const [name, mascot] of Object.entries(MASCOTS)) test(`Mascot ${name}: standalone RGBA, clear margins and opaque characters`, async () => {
  const bytes = await readFile(new URL(`../public/${mascot.src}`, import.meta.url));
  assert.equal(sha256(bytes), manifest.states[name].sha256);
  const { width, height, pixels } = decodeRgbaPng(bytes);
  assert.deepEqual([width, height], [512, 384]);
  let transparent = 0, opaque = 0, antialiased = 0, white = 0;
  let left = width, top = height, right = 0, bottom = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const index = (y * width + x) * 4, alpha = pixels[index + 3];
    if (x < 16 || y < 16 || x >= width - 16 || y >= height - 16) assert.equal(alpha, 0, 'No cut-off or neighbouring sprite at the edges');
    if (alpha === 0) transparent++;
    else {
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + 1); bottom = Math.max(bottom, y + 1);
      if (alpha === 255) {
        opaque++;
        if (pixels[index] > 230 && pixels[index + 1] > 230 && pixels[index + 2] > 230) white++;
      } else antialiased++;
    }
  }
  assert.ok(transparent > width * height / 2, 'The background must actually be transparent');
  assert.ok(opaque > 15000, 'Both characters must remain visible');
  assert.ok(white > 100, 'White clothing and fur must not be keyed out');
  assert.ok(antialiased > 100, 'Preserve soft silhouette edges');
  assert.deepEqual([left, top, right, bottom], manifest.states[name].bounds);
});

test('Mascot source is reproducible and CSS no longer windows a sprite sheet', async () => {
  const source = await readFile(new URL('../artwork/mascots-source.jpeg', import.meta.url));
  assert.equal(sha256(source), manifest.sourceSha256);
  const css = await readFile(new URL('../public/css/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /zakhar-teddy-original|\.mascot[^{}]*::before|mix-blend-mode/);
  assert.match(css, /\.mascot>img\{[^}]*object-fit:contain/);
  assert.equal(new Set(Object.values(MASCOTS).map(m => m.src)).size, 7);
});

test('Every screen uses one whole image; reactions update its source and accessible description', () => {
  const dom = new JSDOM(html, { url: 'https://example.test/anya-math/' });
  const document = dom.window.document;
  const containers = document.querySelectorAll('.mascot');
  assert.equal(containers.length, 3);
  for (const container of containers) {
    assert.equal(container.getAttribute('role'), 'img');
    assert.equal(container.querySelectorAll('img').length, 1);
    const image = container.querySelector('img');
    assert.equal(image.alt, ''); // The parent names the complete pair once.
    for (const [name, mascot] of Object.entries(MASCOTS)) {
      renderMascot(container, name);
      assert.equal(container.dataset.reaction, name);
      assert.equal(container.getAttribute('aria-label'), mascot.label);
      assert.equal(image.getAttribute('src'), mascot.src);
      assert.equal(new URL(image.src).pathname, `/anya-math/assets/mascots/${name}.png`);
      assert.ok(document.querySelector(`link[rel="preload"][as="image"][href="${mascot.src}"]`));
    }
    renderMascot(container, 'unknown-reaction');
    assert.equal(image.getAttribute('src'), MASCOTS.idle.src);
  }
  dom.window.close();
});
