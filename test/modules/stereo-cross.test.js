const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/mono-stereo-splitter.js');
require('../../src/modules/stereo-cross.js');

const T = 'Stereo to Stereo Cross';

function withSource(l, r, inputs) {
  const p = E.createPatch();
  const sp = E.addComponent(p, 'Mono to Stereo Splitter');
  Object.assign(sp.inputs, { signal: 1, left: l, right: r });
  const c = E.addComponent(p, T);
  Object.assign(c.inputs, inputs);
  E.connect(p, sp.id, c.id, 'signal');
  return { p, c };
}

test('Default matrix is the identity', () => {
  const { p, c } = withSource(2, 5, {});
  const out = E.renderNode(p, c.id, 2, SR);
  assert.ok(close(out.left[0], 2) && close(out.right[0], 5));
});

test('General matrix: L = SL·LL + SR·RL, R = SL·LR + SR·RR', () => {
  const { p, c } = withSource(2, 5, { leftToLeft: 0.1, leftToRight: 0.2, rightToLeft: 0.3, rightToRight: 0.4 });
  const out = E.renderNode(p, c.id, 2, SR);
  assert.ok(close(out.left[1], 2 * 0.1 + 5 * 0.3));
  assert.ok(close(out.right[1], 2 * 0.2 + 5 * 0.4));
});

test('Swap and collapse matrices', () => {
  let { p, c } = withSource(2, 5, { leftToLeft: 0, leftToRight: 1, rightToLeft: 1, rightToRight: 0 });
  let out = E.renderNode(p, c.id, 1, SR);
  assert.ok(close(out.left[0], 5) && close(out.right[0], 2));
  ({ p, c } = withSource(2, 5, { leftToLeft: 0, leftToRight: 0, rightToLeft: 0, rightToRight: 0 }));
  out = E.renderNode(p, c.id, 1, SR);
  assert.equal(out.left[0], 0);
  assert.equal(out.right[0], 0);
});

test('Mono input is duplicated, zero length, metadata', () => {
  const { p, c } = single(T, { signal: 1, leftToLeft: 1, leftToRight: 1, rightToLeft: 1, rightToRight: 1 });
  const out = E.renderNode(p, c.id, 2, SR);
  assert.ok(close(out.left[0], 2) && close(out.right[0], 2));
  assert.equal(E.renderNode(p, c.id, 0, SR).left.length, 0);
  assert.equal(E.TYPES[T].stereoOutput, true);
  assert.equal(E.TYPES[T].group, 'Stereo');
  assert.equal(E.TYPES[T].inputs[0].stereo, true);
});

test('Cross in a full stereo patch', () => {
  const { p, c } = withSource(1, 0, { leftToLeft: 0, leftToRight: 1, rightToLeft: 0, rightToRight: 0 });
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { stereo: true, duration: 0.01, sampleRate: SR });
  E.connect(p, c.id, rec.id, 'signal');
  const r = E.render(p);
  assert.ok(close(r.channels[0][3], 0) && close(r.channels[1][3], 1));
});
