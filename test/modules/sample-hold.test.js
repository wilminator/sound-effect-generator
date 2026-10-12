const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, single } = require('../helpers.js');
require('../../src/modules/sample-hold.js');
require('../../src/modules/sine.js');
require('../../src/modules/sequencer.js');

function patchWith(signalVals, trigVals) {
  // Drives both inputs from tiny stepped components built from the Sequencer is awkward,
  // so use the render function directly with a fake context.
  const def = E.TYPES['Sample and Hold'];
  const ctx = {
    n: signalVals.length,
    input: (k) => Float32Array.from(k === 'signal' ? signalVals : trigVals)
  };
  return def.render(ctx);
}

test('latches Signal on positive-to-negative trigger crossings', () => {
  const out = patchWith([1, 2, 3, 4, 5, 6, 7, 8], [1, 1, -1, -1, 1, 1, -1, 1]);
  assert.deepEqual(Array.from(out), [0, 0, 3, 3, 3, 3, 7, 7]);
});

test('zero counts as non-negative, so a touch of 0 on the way down fires once', () => {
  const out = patchWith([1, 2, 3, 4, 5], [1, 0, -1, -2, -3]);
  assert.deepEqual(Array.from(out), [0, 0, 3, 3, 3]);
});

test('negative-to-positive and a trigger starting negative do not fire; output is 0 before the first trigger', () => {
  assert.deepEqual(Array.from(patchWith([5, 5, 5, 5], [-1, -1, 1, 1])), [0, 0, 0, 0]);
  assert.deepEqual(Array.from(patchWith([5, 5, 5], [0, 0, 0])), [0, 0, 0]);
});

test('zero-length request and unconnected inputs', () => {
  assert.equal(patchWith([], []).length, 0);
  const { p, c } = single('Sample and Hold', { signal: 0.5, trigger: -1 });
  const out = E.renderNode(p, c.id, 10, SR);
  assert.ok(Array.from(out).every((v) => v === 0));
});

test('sample-and-hold of a sine by a slow square in a full patch', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.25, sampleRate: SR });
  const sh = E.addComponent(p, 'Sample and Hold');
  const sig = E.addComponent(p, 'Sine');
  const trig = E.addComponent(p, 'Square');
  sig.inputs.freq = 37;
  trig.inputs.freq = 20; // 50 ms period, falls every 50 ms (starts positive)
  E.connect(p, sig.id, sh.id, 'signal');
  E.connect(p, trig.id, sh.id, 'trigger');
  E.connect(p, sh.id, rec.id, 'signal');
  const r = E.render(p);
  const ch = r.channels[0];
  const distinct = new Set(Array.from(ch).map((v) => Math.round(v * 1e6)));
  assert.ok(distinct.size >= 3 && distinct.size <= 6, `distinct ${distinct.size}`);
  // output only changes at trigger falling edges (every 400 samples, 200-sample half period offset)
  let changes = 0;
  for (let i = 1; i < ch.length; i++) if (ch[i] !== ch[i - 1]) changes++;
  assert.ok(changes <= 5);
});
