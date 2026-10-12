const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/mono-stereo-splitter.js');
require('../../src/modules/stereo-mono-merger.js');

const T = 'Stereo to Mono Merger';

/** Splitter(signal 1, left, right) -> target component's signal input. */
function withSource(type, l, r, inputs) {
  const p = E.createPatch();
  const sp = E.addComponent(p, 'Mono to Stereo Splitter');
  Object.assign(sp.inputs, { signal: 1, left: l, right: r });
  const c = E.addComponent(p, type);
  Object.assign(c.inputs, inputs);
  E.connect(p, sp.id, c.id, 'signal');
  return { p, c };
}

test('Merger: out = SL·Left + SR·Right', () => {
  const { p, c } = withSource(T, 2, 3, { left: 0.5, right: 10 });
  const out = E.renderNode(p, c.id, 3, SR);
  assert.ok(out instanceof Float32Array);
  assert.ok(close(out[0], 2 * 0.5 + 3 * 10));
});

test('Merger left only / right only', () => {
  let { p, c } = withSource(T, 2, 3, { left: 1, right: 0 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 2));
  ({ p, c } = withSource(T, 2, 3, { left: 0, right: 1 }));
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 3));
});

test('Merger with a mono (duplicated) input and defaults gives the signal back', () => {
  const { p, c } = single(T, { signal: 0.8 });
  assert.ok(close(E.renderNode(p, c.id, 2, SR)[1], 0.8));
});

test('Merger: zero length, unconnected, metadata', () => {
  const { p, c } = single(T);
  assert.equal(E.renderNode(p, c.id, 0, SR).length, 0);
  assert.equal(E.renderNode(p, c.id, 4, SR)[3], 0);
  assert.ok(!E.TYPES[T].stereoOutput);
  assert.equal(E.TYPES[T].inputs[0].stereo, true);
  assert.equal(E.TYPES[T].group, 'Stereo');
});

test('Merger in a full mono patch', () => {
  const { p, c } = withSource(T, 1, 0.5, { left: 1, right: 1 });
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.01, sampleRate: SR });
  E.connect(p, c.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels.length, 1);
  assert.ok(close(r.channels[0][0], 1.5));
});
