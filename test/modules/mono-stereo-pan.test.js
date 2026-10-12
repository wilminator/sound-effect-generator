const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/mono-stereo-pan.js');

const T = 'Mono to Stereo Pan';

test('Pan is linear: Pan 0.3 sends 0.7 left and 0.3 right (from the help)', () => {
  const { p, c } = single(T, { signal: 1, pan: 0.3 });
  const out = E.renderNode(p, c.id, 3, SR);
  assert.ok(close(out.left[0], 0.7) && close(out.right[0], 0.3));
});

test('Pan 0 is all left, 1 is all right, default 0.5 is half each', () => {
  let { p, c } = single(T, { signal: 2, pan: 0 });
  let out = E.renderNode(p, c.id, 2, SR);
  assert.equal(out.left[0], 2);
  assert.equal(out.right[0], 0);
  ({ p, c } = single(T, { signal: 2, pan: 1 }));
  out = E.renderNode(p, c.id, 2, SR);
  assert.equal(out.left[0], 0);
  assert.equal(out.right[0], 2);
  ({ p, c } = single(T, { signal: 2 }));
  out = E.renderNode(p, c.id, 2, SR);
  assert.equal(out.left[0], 1);
  assert.equal(out.right[0], 1);
});

test('Pan outside 0..1 is legal (extrapolates)', () => {
  const { p, c } = single(T, { signal: 1, pan: 2 });
  const out = E.renderNode(p, c.id, 1, SR);
  assert.equal(out.left[0], -1);
  assert.equal(out.right[0], 2);
});

test('Pan: zero length and metadata', () => {
  const { p, c } = single(T);
  assert.equal(E.renderNode(p, c.id, 0, SR).left.length, 0);
  assert.equal(E.TYPES[T].stereoOutput, true);
  assert.equal(E.TYPES[T].group, 'Stereo');
});

test('Pan modulated by a Sweep in a full patch', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 200 });
  const pan = E.addComponent(p, T);
  const sweep = E.addComponent(p, 'Sweep');
  E.connect(p, sine.id, pan.id, 'signal');
  E.connect(p, sweep.id, pan.id, 'pan');
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { stereo: true, duration: 0.5, sampleRate: SR });
  E.connect(p, pan.id, rec.id, 'signal');
  const r = E.render(p);
  const [l, rr] = r.channels;
  let e1 = 0, e2 = 0, e3 = 0, e4 = 0;
  for (let i = 0; i < 400; i++) { e1 += l[i] ** 2; e2 += rr[i] ** 2; }
  for (let i = 3600; i < 4000; i++) { e3 += l[i] ** 2; e4 += rr[i] ** 2; }
  assert.ok(e1 > e2 * 4, 'starts left');
  assert.ok(e4 > e3 * 4, 'ends right');
});
