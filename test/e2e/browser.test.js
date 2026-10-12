// Browser end-to-end tests: load index.html from disk in headless Chromium and drive the UI.
// Skipped when Playwright isn't installed (npm install, or a global install on NODE_PATH).
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { decodeWav } = require('../../src/core/wav.js');

let playwright = null;
try {
  playwright = require('playwright');
} catch (e) {
  // not installed
}

const PAGE = pathToFileURL(path.join(__dirname, '..', '..', 'index.html')).href;
const opts = { skip: playwright ? false : 'Playwright is not installed' };

async function openApp(t) {
  const executablePath = process.env.CHROMIUM_PATH || undefined;
  const browser = await playwright.chromium.launch({ executablePath });
  t.after(() => browser.close());
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(PAGE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  return { page, errors };
}

/** Drags from one element's center to another's. */
async function drag(page, from, to) {
  const a = await page.locator(from).boundingBox();
  const b = await page.locator(to).boundingBox();
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 5 });
  await page.mouse.up();
}

test('the page loads every module with no errors', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const types = await page.evaluate(() => window.QuackEngine.types());
  for (const type of types) {
    if (type === 'Recorder') continue;
    assert.equal(await page.locator('#toolbar button', { hasText: new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).count(), 1, type);
  }
  assert.deepEqual(errors, []);
});

test('build a patch by hand, render it and export a WAV', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await page.click('#new');
  await page.locator('#toolbar button', { hasText: /^Sine$/ }).click();
  const sine = await page.evaluate(() => {
    const p = JSON.parse(localStorage.getItem('quack.patch'));
    return p.components.find((c) => c.type === 'Sine').id;
  });
  const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('quack.patch')).components.find((c) => c.type === 'Recorder').id);
  await drag(page, `.dot.out[data-out="${sine}"]`, `.dot.in[data-to="${rec}"][data-input="signal"]`);
  const connections = await page.evaluate(() => JSON.parse(localStorage.getItem('quack.patch')).connections);
  assert.deepEqual(connections, [{ from: sine, to: rec, input: 'signal' }]);

  await page.click('#create-play');
  await page.waitForFunction(() => /Peak/.test(document.getElementById('status').textContent));
  assert.match(await page.textContent('#status'), /Peak 1\.000/);

  await page.selectOption('#format', 'wav');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#export')]);
  assert.equal(download.suggestedFilename(), 'quack.wav');
  const fs = require('node:fs');
  const wav = decodeWav(fs.readFileSync(await download.path()));
  assert.equal(wav.sampleRate, 22050);
  assert.equal(wav.channels[0].length, 22050);
  assert.deepEqual(errors, []);
});

test('every example renders in the browser', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const names = await page.evaluate(() => Object.keys(window.QuackExamples));
  for (const name of names) {
    await page.selectOption('#examples', name);
    await page.click('#create-play');
    await page.waitForFunction(() => /Peak|Could not/.test(document.getElementById('status').textContent));
    const status = await page.textContent('#status');
    assert.match(status, /Peak/, name + ': ' + status);
    await page.evaluate(() => { document.getElementById('status').textContent = ''; });
  }
  assert.deepEqual(errors, []);
});

test('save and open a patch file', opts, async (t) => {
  const { page } = await openApp(t);
  await page.selectOption('#examples', 'Wood block');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save')]);
  const file = await download.path();
  await page.click('#new');
  assert.equal(await page.locator('.node').count(), 1);
  await page.setInputFiles('#file', { name: 'wood.json', mimeType: 'application/json', buffer: require('node:fs').readFileSync(file) });
  await page.waitForFunction(() => document.querySelectorAll('.node').length > 1);
  assert.match(await page.textContent('#status'), /Opened wood.json/);
});
