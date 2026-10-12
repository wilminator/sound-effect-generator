const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/mono-stereo-splitter.js');

test('Splitter: L = S·Left, R = S·Right', () => {
  const { p, c } = single('Mono to Stereo Splitter', { signal: 2, left: 0.25, right: -3 });
  const out = E.renderNode(p, c.id, 4, SR);
  assert.ok(E.isStereo(out));
  assert.deepEqual(Array.from(out.left), [0.5, 0.5, 0.5, 0.5]);
  assert.deepEqual(Array.from(out.right), [-6, -6, -6, -6]);
});

test('Splitter defaults pass the signal to both channels; is flagged stereo output', () => {
  const { p, c } = single('Mono to Stereo Splitter', { signal: 0.7 });
  const out = E.renderNode(p, c.id, 3, SR);
  assert.ok(close(out.left[0], 0.7) && close(out.right[2], 0.7));
  assert.equal(E.TYPES['Mono to Stereo Splitter'].stereoOutput, true);
  assert.equal(E.TYPES['Mono to Stereo Splitter'].group, 'Stereo');
});

test('Splitter: zero length and unconnected zero signal', () => {
  const { p, c } = single('Mono to Stereo Splitter');
  const z = E.renderNode(p, c.id, 0, SR);
  assert.equal(z.left.length, 0);
  assert.equal(z.right.length, 0);
  const out = E.renderNode(p, c.id, 5, SR);
  assert.ok(out.left.every((v) => v === 0));
});

test('Splitter in a full patch: Sine -> Splitter -> stereo Recorder', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 100 });
  const sp = E.addComponent(p, 'Mono to Stereo Splitter');
  Object.assign(sp.inputs, { left: 1, right: 0.5 });
  E.connect(p, sine.id, sp.id, 'signal');
  const rec = E.getRecorder(p);
  rec.props.stereo = true;
  rec.props.duration = 0.1;
  rec.props.sampleRate = SR;
  E.connect(p, sp.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels.length, 2);
  assert.ok(close(r.channels[1][20], r.channels[0][20] / 2, 1e-4));
  assert.ok(Math.abs(r.channels[0][20]) > 0.9);
});
