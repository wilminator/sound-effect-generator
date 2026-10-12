const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, impulse } = require('../helpers.js');

test('Comb Filter adds Strength·S(t − 1/Freq)', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer'); // a single impulse-ish block
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR, repeatA: false });
  const comb = E.addComponent(p, 'Comb Filter');
  Object.assign(comb.inputs, { freq: 100, strength: 0.5 });
  E.connect(p, seq.id, comb.id, 'signal');
  const out = E.renderNode(p, comb.id, 200, SR);
  assert.ok(close(out[0], 1));
  assert.ok(close(out[80], 0.5)); // 1/100 s = 80 samples later
  assert.ok(close(out[40], 0));
});
