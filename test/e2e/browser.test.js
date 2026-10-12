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

// ---------------------------------------------------------------- UI features

const fs = require('node:fs');

/** Registers throwaway components that use every property type, actions, validation and stereo. */
async function registerTestKit(page) {
  await page.evaluate(() => {
    const E = window.QuackEngine;
    if (E.TYPES['UI Test']) return;
    E.register('UI Test', {
      group: 'Sources',
      help: 'A throwaway component for UI tests.',
      inputs: [{ key: 'level', label: 'Level', default: 0.5 }],
      props: [
        { key: 'notes', label: 'Notes', type: 'text', multiline: true, default: '' },
        { key: 'sample', label: 'Sample', type: 'file', default: null },
        {
          key: 'steps', label: 'Steps', type: 'table', default: [],
          columns: [
            { key: 'time', label: 'Time', type: 'number', default: 0 },
            { key: 'shape', label: 'Shape', type: 'select', options: ['Up', 'Down'], default: 'Up' },
            { key: 'on', label: 'On', type: 'bool', default: true },
            { key: 'tag', label: 'Tag', type: 'text', default: '' }
          ]
        },
        { key: 'count', label: 'Count', type: 'number', min: 1, max: 8, step: 1, default: 2 },
        { key: 'fail', label: 'Fail', type: 'bool', default: false }
      ],
      validate: (c) => (c.props.fail ? 'fail is switched on' : null),
      actions: [
        {
          label: 'Fill',
          fields: [{ key: 'rows', label: 'Rows', default: 3 }, { key: 'tag', label: 'Tag', default: 'x' }],
          run(c, { values }) {
            if (values.rows > 10) throw new Error('too many rows');
            c.props.steps = Array.from({ length: values.rows }, (_, i) => ({ time: i, shape: 'Up', on: true, tag: values.tag }));
          }
        },
        { label: 'Import', file: 'text', run(c, { text, name }) { c.props.notes = name + ':' + text; } },
        { label: 'Bytes', file: 'binary', run(c, { bytes }) { c.props.count = bytes.length; } }
      ],
      render: (ctx) => ctx.input('level')
    });
    E.register('UI Stereo', {
      group: 'Stereo',
      help: 'A throwaway stereo source.',
      inputs: [{ key: 'in', label: 'In', default: 0, stereo: true }],
      stereoOutput: true,
      render: (ctx) => ({ left: new Float32Array(ctx.n).fill(0.5), right: new Float32Array(ctx.n).fill(-0.25) })
    });
  });
}

/** Adds a component, selects it and redraws; returns its id. */
function addAndSelect(page, type) {
  return page.evaluate((t) => {
    const c = window.QuackEngine.addComponent(window.QuackApp.getPatch(), t, 60, 260);
    window.QuackApp.select(c.id);
    return c.id;
  }, type);
}

const getComp = (page, id) => page.evaluate((i) => window.QuackEngine.getComponent(window.QuackApp.getPatch(), i), id);
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem('quack.patch')));

async function pickFile(page, clickSelector, file) {
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click(clickSelector)]);
  await chooser.setFiles(file);
}

test('help shows on toolbar buttons, nodes and the side panel', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const help = await page.evaluate(() => window.QuackEngine.TYPES.Sine.help);
  assert.equal(await page.getAttribute('#toolbar button:text-is("Sine")', 'title'), help);
  const sine = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine').id);
  assert.equal(await page.getAttribute(`.node[data-id="${sine}"] .node-title`, 'title'), help);
  await page.click(`.node[data-id="${sine}"] .node-title`);
  assert.equal(await page.textContent('#panel .help'), help);
  assert.deepEqual(errors, []);
});

test('text, select, number, file and table properties are editable', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await registerTestKit(page);
  const id = await addAndSelect(page, 'UI Test');

  // Multiline text is a textarea.
  await page.fill('[data-prop="notes"] textarea', 'line one\nline two');
  await page.locator('[data-prop="notes"] textarea').blur();
  assert.equal((await getComp(page, id)).props.notes, 'line one\nline two');

  // Numbers respect min, max and step.
  await page.fill('[data-prop="count"] input', '20');
  await page.press('[data-prop="count"] input', 'Enter');
  assert.equal((await getComp(page, id)).props.count, 8);
  await page.fill('[data-prop="count"] input', '2.6');
  await page.press('[data-prop="count"] input', 'Enter');
  assert.equal((await getComp(page, id)).props.count, 3);

  // A file is stored as base64 with its name and shown with its size.
  await pickFile(page, '[data-prop="sample"] button.pick', { name: 'clip.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([1, 2, 3, 4, 5]) });
  await page.waitForFunction(() => /clip\.bin \(5 B\)/.test(document.querySelector('[data-prop="sample"] .file-name').textContent));
  assert.deepEqual((await getComp(page, id)).props.sample, { name: 'clip.bin', data: 'AQIDBAU=' });
  assert.deepEqual((await saved(page)).components.find((c) => c.id === id).props.sample.name, 'clip.bin');
  await page.click('[data-prop="sample"] button.clear');
  assert.equal((await getComp(page, id)).props.sample, null);
  assert.equal(await page.textContent('[data-prop="sample"] .file-name'), 'none');

  // Table: add rows, edit each column type, reorder and delete.
  await page.click('[data-prop="steps"] .add-row');
  await page.click('[data-prop="steps"] .add-row');
  assert.equal(await page.locator('[data-prop="steps"] tbody tr').count(), 2);
  await page.fill('[data-prop="steps"] tbody tr:nth-child(1) [data-col="time"]', '1.5');
  await page.press('[data-prop="steps"] tbody tr:nth-child(1) [data-col="time"]', 'Enter');
  await page.selectOption('[data-prop="steps"] tbody tr:nth-child(1) [data-col="shape"]', { label: 'Down' });
  await page.uncheck('[data-prop="steps"] tbody tr:nth-child(1) [data-col="on"]');
  await page.fill('[data-prop="steps"] tbody tr:nth-child(2) [data-col="tag"]', 'second');
  await page.press('[data-prop="steps"] tbody tr:nth-child(2) [data-col="tag"]', 'Enter');
  assert.deepEqual((await getComp(page, id)).props.steps, [
    { time: 1.5, shape: 'Down', on: false, tag: '' },
    { time: 0, shape: 'Up', on: true, tag: 'second' }
  ]);
  await page.click('[aria-label="Move row 2 up"]');
  assert.equal((await getComp(page, id)).props.steps[0].tag, 'second');
  await page.click('[aria-label="Move row 1 down"]');
  assert.equal((await getComp(page, id)).props.steps[1].tag, 'second');
  await page.click('[aria-label="Delete row 1"]');
  assert.deepEqual((await getComp(page, id)).props.steps, [{ time: 0, shape: 'Up', on: true, tag: 'second' }]);

  // The Recorder's select keeps numeric options as numbers; its text is a single line.
  const rec = await page.evaluate(() => window.QuackEngine.getRecorder(window.QuackApp.getPatch()).id);
  await page.click(`.node[data-id="${rec}"] .node-title`);
  await page.selectOption('[data-prop="bits"] select', { label: '8' });
  assert.equal((await getComp(page, rec)).props.bits, 8);
  assert.equal(await page.locator('[data-prop="filename"] input[type="text"]').count(), 1);
  await page.fill('[data-prop="filename"] input', 'boing');
  await page.press('[data-prop="filename"] input', 'Enter');
  assert.equal((await getComp(page, rec)).props.filename, 'boing');
  assert.deepEqual(errors, []);
});

test('a Patch property shows its file name after a reload', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const inner = await page.evaluate(() => window.QuackEngine.serialize(window.QuackExamples['Simple tone']()));
  const id = await addAndSelect(page, 'Patch');
  await pickFile(page, '[data-prop="patch"] button.pick', { name: 'tone.json', mimeType: 'application/json', buffer: Buffer.from(inner) });
  await page.waitForFunction(() => document.querySelector('[data-prop="patch"] .file-name').textContent === 'tone.json');
  await page.reload();
  await page.click(`.node[data-id="${id}"] .node-title`);
  assert.equal(await page.textContent('[data-prop="patch"] .file-name'), 'tone.json');
  assert.deepEqual(errors, []);
});

test('actions run with dialog fields and files, and report errors', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await registerTestKit(page);
  const id = await addAndSelect(page, 'UI Test');

  await page.click('#panel button.action:text-is("Fill")');
  await page.waitForSelector('.modal');
  assert.equal(await page.inputValue('.modal [data-field="rows"]'), '3');
  assert.equal(await page.inputValue('.modal [data-field="tag"]'), 'x');
  await page.fill('.modal [data-field="rows"]', '2');
  await page.fill('.modal [data-field="tag"]', 'q');
  await page.click('.modal button[type="submit"]');
  assert.equal(await page.locator('.modal').count(), 0);
  assert.deepEqual((await getComp(page, id)).props.steps.map((r) => r.tag), ['q', 'q']);
  assert.equal(await page.locator('[data-prop="steps"] tbody tr').count(), 2);
  assert.match(await page.textContent('#status'), /Fill: done/);

  await page.click('#panel button.action:text-is("Fill")');
  await page.fill('.modal [data-field="rows"]', '20');
  await page.press('.modal [data-field="rows"]', 'Enter');
  assert.match(await page.textContent('#status'), /Fill: too many rows/);
  assert.equal(await page.locator('#status.warn').count(), 1);

  // Escape cancels the dialog without running.
  await page.click('#panel button.action:text-is("Fill")');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal').count(), 0);
  assert.equal((await getComp(page, id)).props.steps.length, 2);

  await pickFile(page, '#panel button.action:text-is("Import")', { name: 'a.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await page.waitForFunction((i) => window.QuackEngine.getComponent(window.QuackApp.getPatch(), i).props.notes === 'a.txt:hello', id);
  await pickFile(page, '#panel button.action:text-is("Bytes")', { name: 'b.bin', mimeType: 'application/octet-stream', buffer: Buffer.from([9, 9, 9, 9]) });
  await page.waitForFunction((i) => window.QuackEngine.getComponent(window.QuackApp.getPatch(), i).props.count === 4, id);
  assert.deepEqual(errors, []);
});

test('validation errors show on the node and in the panel, and stop Create', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await registerTestKit(page);
  const id = await addAndSelect(page, 'UI Test');
  await page.check('[data-prop="fail"] input');
  const node = page.locator(`.node[data-id="${id}"]`);
  assert.match(await node.getAttribute('class'), /invalid/);
  assert.match(await node.getAttribute('title'), /fail is switched on/);
  assert.equal(await page.textContent('#panel .error'), 'fail is switched on');
  const color = await node.evaluate((n) => getComputedStyle(n).borderTopColor);
  const errColor = await page.evaluate(() => {
    const d = document.createElement('div');
    d.style.color = 'var(--error)';
    document.body.appendChild(d);
    const c = getComputedStyle(d).color;
    d.remove();
    return c;
  });
  assert.equal(color, errColor);
  await page.click('#create');
  assert.match(await page.textContent('#status'), /Could not create the sound: UITest1: fail is switched on/);
  await page.uncheck('[data-prop="fail"] input');
  assert.doesNotMatch(await node.getAttribute('class'), /invalid/);
  assert.equal(await page.locator('#panel .error').count(), 0);
  assert.deepEqual(errors, []);
});

test('context menu and keyboard: copy, paste, cut, duplicate, rename, delete', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const count = (type) => page.evaluate((ty) => window.QuackApp.getPatch().components.filter((c) => c.type === ty).length, type);
  const sine = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine').id);
  const title = `.node[data-id="${sine}"] .node-title`;

  await page.click(title, { button: 'right' });
  await page.waitForSelector('.menu');
  const labels = await page.locator('.menu button span').allTextContents();
  assert.deepEqual(labels, ['Inputs/Properties', 'Rename', 'Cut', 'Copy', 'Paste', 'Duplicate', 'Disconnect output', 'Delete', 'Scope']);
  assert.equal(await page.locator('.menu [data-command="Paste"]').isDisabled(), true);
  await page.click('.menu [data-command="Copy"]');
  assert.equal(await page.locator('.menu').count(), 0);

  // Paste at the pointer from the board's own menu.
  const box = await page.locator('#board').boundingBox();
  await page.mouse.click(box.x + 120, box.y + 330, { button: 'right' });
  await page.click('.menu [data-command="Paste"]');
  assert.equal(await count('Sine'), 2);
  const pasted = await page.evaluate(() => {
    const p = window.QuackApp.getPatch();
    return p.components[p.components.length - 1];
  });
  const orig = await getComp(page, sine);
  assert.deepEqual(pasted.inputs, orig.inputs);
  assert.equal(pasted.name, 'Sine2');
  const scroll = await page.evaluate(() => ({ x: document.getElementById('board').scrollLeft, y: document.getElementById('board').scrollTop }));
  assert.ok(Math.abs(pasted.x - (120 + scroll.x)) < 3 && Math.abs(pasted.y - (330 + scroll.y)) < 3, JSON.stringify(pasted));

  // Keyboard shortcuts on the focused node.
  await page.click(title);
  await page.keyboard.press('Control+C');
  await page.mouse.move(box.x + 400, box.y + 400);
  await page.keyboard.press('Control+V');
  assert.equal(await count('Sine'), 3);
  await page.keyboard.press('Control+D');
  assert.equal(await count('Sine'), 4);
  await page.keyboard.press('Delete');
  assert.equal(await count('Sine'), 3);

  // Duplicate and Cut from the menu; Cut keeps it on the clipboard.
  await page.click(title, { button: 'right' });
  await page.click('.menu [data-command="Duplicate"]');
  assert.equal(await count('Sine'), 4);
  await page.click(title, { button: 'right' });
  await page.click('.menu [data-command="Disconnect output"]');
  assert.deepEqual((await page.evaluate(() => window.QuackApp.getPatch().connections)), []);
  await page.click(title, { button: 'right' });
  await page.click('.menu [data-command="Cut"]');
  assert.equal(await page.locator(`.node[data-id="${sine}"]`).count(), 0);
  assert.equal(await count('Sine'), 3);
  await page.keyboard.press('Control+V');
  assert.equal(await count('Sine'), 4);

  // Rename focuses the name field; the Recorder can't be cut or deleted.
  const rec = await page.evaluate(() => window.QuackEngine.getRecorder(window.QuackApp.getPatch()).id);
  await page.click(`.node[data-id="${rec}"] .node-title`, { button: 'right' });
  assert.equal(await page.locator('.menu [data-command="Delete"]').isDisabled(), true);
  assert.equal(await page.locator('.menu [data-command="Cut"]').isDisabled(), true);
  await page.click('.menu [data-command="Rename"]');
  await page.keyboard.type('Master');
  await page.keyboard.press('Enter');
  assert.equal((await getComp(page, rec)).name, 'Master');
  await page.click(`.node[data-id="${rec}"] .node-title`);
  await page.keyboard.press('Delete');
  assert.ok(await getComp(page, rec));

  // Escape closes the menu.
  await page.click(`.node[data-id="${rec}"] .node-title`, { button: 'right' });
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu').count(), 0);
  assert.deepEqual(errors, []);
});

test('save a custom component, load it, and reuse it from the toolbar', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const sine = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine').id);
  await page.click(`.node[data-id="${sine}"] .node-title`);
  await page.fill('#panel [data-fkey$=":in:freq"]', '1234');
  await page.press('#panel [data-fkey$=":in:freq"]', 'Enter');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#save-custom')]);
  assert.equal(download.suggestedFilename(), 'Sine.ccf.json');
  const ccf = fs.readFileSync(await download.path());
  assert.equal(JSON.parse(ccf).inputs.freq, 1234);

  await page.click('#new');
  await pickFile(page, '#ccf-load', { name: 'Sine.ccf.json', mimeType: 'application/json', buffer: ccf });
  await page.waitForFunction(() => document.querySelectorAll('.node').length === 2);
  const loaded = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine'));
  assert.equal(loaded.inputs.freq, 1234);
  assert.equal(await page.locator('#toolbar .custom-add').count(), 1);

  // Remembered across reloads; the button adds another; × forgets it.
  await page.reload();
  assert.equal(await page.textContent('#toolbar .custom-add'), 'Sine');
  assert.match(await page.getAttribute('#toolbar .custom-add', 'title'), /^Sine: /);
  await page.click('#toolbar .custom-add');
  assert.equal(await page.evaluate(() => window.QuackApp.getPatch().components.filter((c) => c.inputs.freq === 1234).length), 2);
  await page.click('#toolbar .custom-remove');
  assert.equal(await page.locator('#toolbar .custom-add').count(), 0);
  await page.reload();
  assert.equal(await page.locator('#toolbar .custom-add').count(), 0);

  // A bad file is reported, not thrown.
  await pickFile(page, '#ccf-load', { name: 'bad.ccf.json', mimeType: 'application/json', buffer: Buffer.from('{"x":1}') });
  await page.waitForFunction(() => /Could not load bad\.ccf\.json/.test(document.getElementById('status').textContent));
  assert.deepEqual(errors, []);
});

test('scope windows redraw after Create, zoom, scroll and export PNG', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const sine = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine').id);
  await page.click(`.node[data-id="${sine}"] .node-title`, { button: 'right' });
  await page.click('.menu [data-command="Scope"]');
  const win = page.locator(`.scope-win[data-id="${sine}"]`);
  await win.waitFor();
  assert.equal(await win.locator('.scope-title').textContent(), 'Sine1');
  assert.match(await win.locator('.scope-msg').textContent(), /Press Create/);

  // Separate Create and Play buttons.
  assert.equal(await page.isDisabled('#play'), true);
  await page.click('#create');
  assert.match(await page.textContent('#status'), /Peak 0\.800 \(\d+ ms\)/);
  assert.equal(await page.isDisabled('#play'), false);
  assert.equal(await win.getAttribute('data-render'), '1');
  assert.equal(await win.getAttribute('data-samples'), '22050');
  const inked = () => win.locator('canvas').evaluate((cv) => {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    const seen = new Set();
    for (let i = 0; i < d.length; i += 4) seen.add(d[i] + ',' + d[i + 1] + ',' + d[i + 2]);
    return seen.size;
  });
  assert.ok(await inked() > 2);
  assert.equal(await win.locator('.scope-scroll').isHidden(), true);

  // Zoom in with the button and with Ctrl+I, out with Ctrl+O.
  await win.locator('.zoom-in').click();
  assert.equal(await win.locator('.zoom-label').textContent(), '×2');
  assert.equal(await win.locator('.scope-scroll').isVisible(), true);
  await page.keyboard.press('Control+I');
  assert.equal(await win.locator('.zoom-label').textContent(), '×4');
  for (let i = 0; i < 12; i++) await win.locator('.zoom-in').click();
  assert.equal(await win.locator('.zoom-label').textContent(), '1:1');
  const spacer = await win.locator('.scope-spacer').evaluate((n) => n.offsetWidth);
  assert.equal(spacer, 22050);
  await win.locator('.scope-scroll').evaluate((n) => { n.scrollLeft = 5000; n.dispatchEvent(new Event('scroll')); });
  await page.keyboard.press('Control+O');
  assert.notEqual(await win.locator('.zoom-label').textContent(), '1:1');
  for (let i = 0; i < 20; i++) await win.locator('.zoom-out').click();
  assert.equal(await win.locator('.zoom-label').textContent(), 'Fit');
  await win.locator('select.scale').selectOption('fixed');

  // A second Create redraws every open scope.
  await page.click('#create');
  assert.equal(await win.getAttribute('data-render'), '2');

  const [png] = await Promise.all([page.waitForEvent('download'), win.locator('.png').click()]);
  assert.equal(png.suggestedFilename(), 'Sine1-scope.png');
  const bytes = fs.readFileSync(await png.path());
  assert.equal(bytes.subarray(1, 4).toString(), 'PNG');

  // Dragging by the header moves it; × closes it; deleting the component closes its scope.
  const before = await win.boundingBox();
  await page.mouse.move(before.x + 30, before.y + 12);
  await page.mouse.down();
  await page.mouse.move(before.x - 70, before.y + 62, { steps: 4 });
  await page.mouse.up();
  const after = await win.boundingBox();
  assert.ok(Math.abs(after.x - (before.x - 100)) < 2 && Math.abs(after.y - (before.y + 50)) < 2);
  await win.locator('.close').click();
  assert.equal(await win.count(), 0);
  await page.click(`.node[data-id="${sine}"] .node-title`);
  await page.click('#panel button:text-is("Scope")');
  await win.waitFor();
  await page.click(`.node[data-id="${sine}"] .node-title`);
  await page.keyboard.press('Delete');
  assert.equal(await win.count(), 0);
  assert.deepEqual(errors, []);
});

test('stereo sources draw double wires and stereo scopes', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await registerTestKit(page);
  const id = await page.evaluate(() => {
    const E = window.QuackEngine;
    const p = E.createPatch();
    const c = E.addComponent(p, 'UI Stereo', 100, 100);
    const rec = E.getRecorder(p);
    rec.props.stereo = true;
    E.connect(p, c.id, rec.id, 'signal');
    window.QuackApp.setPatch(p);
    return c.id;
  });
  assert.equal(await page.locator(`#wires g.stereo[data-from="${id}"] path`).count(), 2);
  assert.equal(await page.locator('#wires path.mono').count(), 0);
  assert.equal(await page.locator('.dot.in.stereo[data-input="signal"]').count(), 1);
  assert.equal(await page.locator(`.dot.out.stereo[data-out="${id}"]`).count(), 1);
  await page.click(`.node[data-id="${id}"] .node-title`, { button: 'right' });
  await page.click('.menu [data-command="Scope"]');
  await page.click('#create');
  const win = page.locator(`.scope-win[data-id="${id}"]`);
  assert.match(await win.locator('.scope-msg').textContent(), /22050 samples, stereo/);
  assert.match(await win.locator('.scope-title').textContent(), /stereo/);

  // A mono source on the same input is a single line.
  await page.evaluate(() => {
    const E = window.QuackEngine;
    const p = window.QuackApp.getPatch();
    const s = E.addComponent(p, 'Sine', 100, 300);
    E.connect(p, s.id, E.getRecorder(p).id, 'signal');
    window.QuackApp.redraw();
  });
  assert.equal(await page.locator('#wires g.stereo').count(), 0);
  assert.equal(await page.locator('#wires path.mono').count(), 1);
  assert.deepEqual(errors, []);
});

test('phone layout, themes and visible keyboard focus', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await page.setViewportSize({ width: 375, height: 740 });
  const widths = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    view: window.innerWidth,
    board: document.getElementById('board').scrollWidth,
    boardView: document.getElementById('board').clientWidth
  }));
  assert.ok(widths.doc <= widths.view, JSON.stringify(widths));
  assert.ok(widths.board > widths.boardView);
  const sine = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Sine').id);
  await page.evaluate((i) => window.QuackApp.select(i), sine);
  await page.evaluate((i) => document.querySelector(`.node[data-id="${i}"] .node-title`).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 300 })), sine);
  await page.click('.menu [data-command="Scope"]');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  const box = await page.locator('.scope-win').boundingBox();
  assert.ok(box.x >= 0 && box.x + box.width <= 375);

  await page.setViewportSize({ width: 1200, height: 800 });
  const bg = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await page.emulateMedia({ colorScheme: 'light' });
  const light = await bg();
  await page.emulateMedia({ colorScheme: 'dark' });
  const dark = await bg();
  assert.notEqual(light, dark);
  await page.click('#theme');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'light');
  assert.equal(await bg(), light);
  await page.click('#theme');
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');
  await page.emulateMedia({ colorScheme: 'light' });
  assert.equal(await bg(), dark);
  await page.reload();
  assert.equal(await page.getAttribute('html', 'data-theme'), 'dark');

  await page.focus('#new');
  await page.keyboard.press('Tab');
  const outline = await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle);
  assert.equal(outline, 'solid');
  // Nodes are focusable, and the context menu opens from the keyboard.
  await page.focus(`.node[data-id="${sine}"]`);
  assert.equal(await page.evaluate(() => getComputedStyle(document.activeElement).outlineStyle), 'solid');
  await page.keyboard.press('Shift+F10');
  await page.waitForSelector('.menu');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.command), 'Inputs/Properties');
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.command), 'Rename');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.menu').count(), 0);
  assert.deepEqual(errors, []);
});

test('every component can be added, edited in the panel and rendered from the toolbar', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const types = await page.evaluate(() => window.QuackEngine.types().filter((x) => x !== 'Recorder'));
  for (const type of types) {
    await page.click('#new');
    await page.locator('#toolbar button', { hasText: new RegExp('^' + type.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$') }).click();
    // The new component is selected; its panel shows the help text and one editor per input and property.
    const panel = await page.textContent('#panel');
    assert.ok(panel.includes(type), type + ' panel');
    const ids = await page.evaluate(() => {
      const p = window.QuackApp.getPatch();
      return { c: p.components.find((x) => x.type !== 'Recorder').id, rec: window.QuackEngine.getRecorder(p).id };
    });
    await drag(page, `.dot.out[data-out="${ids.c}"]`, `.dot.in[data-to="${ids.rec}"][data-input="signal"]`);
    await page.click('#create');
    await page.waitForFunction(() => /Peak|silent|Could not/.test(document.getElementById('status').textContent));
    assert.doesNotMatch(await page.textContent('#status'), /Could not/, type);
  }
  assert.deepEqual(errors, []);
});

test('Fourier Wave actions run from the panel', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await page.selectOption('#examples', 'Note (Fourier)');
  const id = await page.evaluate(() => window.QuackApp.getPatch().components.find((c) => c.type === 'Fourier Wave').id);
  await page.evaluate((id) => window.QuackApp.select(id), id);
  await page.locator('#panel button', { hasText: /^Normalise$/ }).click();
  const amps = await page.evaluate((id) => window.QuackApp.getPatch().components.find((c) => c.id === id).props.harmonics.map((h) => h.amp), id);
  assert.ok(amps[0] < 1 && amps[0] > 0.3, 'normalised amplitudes: ' + amps);
  assert.deepEqual(errors, []);
});

test('undo and redo edits, from the buttons and the keyboard', opts, async (t) => {
  const { page, errors } = await openApp(t);
  await page.click('#new');
  await page.waitForTimeout(700); // quick edits merge into one undo step
  const count = () => page.evaluate(() => window.QuackApp.getPatch().components.length);
  await page.locator('#toolbar button', { hasText: /^Sine$/ }).click();
  await page.waitForTimeout(700);
  await page.locator('#toolbar button', { hasText: /^Square$/ }).click();
  assert.equal(await count(), 3);
  await page.click('#undo');
  assert.equal(await count(), 2);
  await page.click('#undo');
  assert.equal(await count(), 1);
  await page.click('#redo');
  assert.equal(await count(), 2);
  await page.click('#board');
  await page.keyboard.press('Control+Z');
  assert.equal(await count(), 1);
  await page.keyboard.press('Control+Y');
  assert.equal(await count(), 2);
  await page.keyboard.press('Control+Shift+Z');
  assert.equal(await count(), 3);
  assert.equal(await page.isDisabled('#redo'), true);
  assert.deepEqual(errors, []);
});

test('Vary nudges the patch (and undoes), and Variations exports a zip of WAVs', opts, async (t) => {
  const { page, errors } = await openApp(t);
  const before = await page.evaluate(() => window.QuackEngine.serialize(window.QuackApp.getPatch()));
  await page.click('#vary');
  const after = await page.evaluate(() => window.QuackEngine.serialize(window.QuackApp.getPatch()));
  assert.notEqual(after, before);
  await page.click('#undo');
  assert.equal(await page.evaluate(() => window.QuackEngine.serialize(window.QuackApp.getPatch())), before);

  await page.click('#variations');
  await page.fill('.modal [data-field="count"]', '3');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.modal button[type="submit"]')]);
  assert.match(download.suggestedFilename(), /-variations\.zip$/);
  const fs = require('node:fs');
  const zip = fs.readFileSync(await download.path());
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 3);
  const data = 30 + zip.readUInt16LE(26); // local header, then the file name
  assert.match(zip.toString('latin1', 30, data), /-1\.wav$/);
  assert.equal(zip.toString('latin1', data, data + 4), 'RIFF', 'the first entry is a WAV');
  assert.deepEqual(errors, []);
});

test('loop, stop and play previous', opts, async (t) => {
  const { page, errors } = await openApp(t);
  assert.equal(await page.isDisabled('#play-prev'), true);
  await page.check('#loop');
  await page.click('#create-play');
  await page.waitForFunction(() => /Peak/.test(document.getElementById('status').textContent));
  assert.equal(await page.isDisabled('#stop'), false);
  await page.click('#stop');
  assert.equal(await page.isDisabled('#stop'), true);
  assert.equal(await page.isDisabled('#play-prev'), true);
  await page.click('#create');
  assert.equal(await page.isDisabled('#play-prev'), false);
  await page.click('#play-prev');
  assert.equal(await page.isDisabled('#stop'), false);
  await page.click('#stop');
  assert.deepEqual(errors, []);
});
