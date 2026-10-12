const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/mono-stereo-splitter.js');
require('../../src/modules/stereo-mono-pan.js');

const T = 'Stereo to Mono Pan';

function withSource(l, r, inputs) {
  const p = E.createPatch();
  const sp = E.addComponent(p, 'Mono to Stereo Splitter');
  Object.assign(sp.inputs, { signal: 1, left: l, right: r });
  const c = E.addComponent(p, T);
  Object.assign(c.inputs, inputs);
  E.connect(p, sp.id, c.id, 'signal');
  return { p, c };
}

test('Pan 0 is the left channel, 1 the right, 0.5 half of each', () => {
  for (const [pan, want] of [[0, 2], [1, 6], [0.5, 4], [0.25, 3]]) {
    const { p, c } = withSource(2, 6, { pan });
    const out = E.renderNode(p, c.id, 2, SR);
    assert.ok(out instanceof Float32Array);
    assert.ok(close(out[0], want), `pan ${pan}`);
  }
});

test('Pan outside 0..1 extrapolates: SL·(1−Pan) + SR·Pan', () => {
  const { p, c } = withSource(2, 6, { pan: 2 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 2 * -1 + 6 * 2));
});

test('Mono input and unconnected inputs', () => {
  let { p, c } = single(T, { signal: 0.5, pan: 0.9 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 0.5));
  ({ p, c } = single(T));
  const out = E.renderNode(p, c.id, 3, SR);
  assert.ok(out.every((v) => v === 0));
  assert.equal(E.renderNode(p, c.id, 0, SR).length, 0);
  assert.equal(E.TYPES[T].group, 'Stereo');
  assert.equal(E.TYPES[T].inputs[0].stereo, true);
});

test('Stereo to Mono Pan in a full patch', () => {
  const { p, c } = withSource(0, 1, { pan: 1 });
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.01, sampleRate: SR });
  E.connect(p, c.id, rec.id, 'signal');
  const r = E.render(p);
  assert.ok(close(r.channels[0][5], 1));
});
