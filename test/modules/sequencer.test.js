const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Sequencer places an input between start and end, and can repeat', () => {
  const { p, c } = single('Sequencer', { sigA: 1 }, { startA: 0.25, endA: 0.5, repeatA: false });
  const out = E.renderNode(p, c.id, SR, SR); // 1 s
  assert.equal(out[0], 0);
  assert.equal(out[Math.round(0.3 * SR)], 1);
  assert.equal(out[Math.round(0.6 * SR)], 0);

  c.props.repeatA = true;
  const rep = E.renderNode(p, c.id, SR, SR);
  assert.equal(rep[Math.round(0.6 * SR)], 1);
  assert.equal(rep[Math.round(0.9 * SR)], 1);
});

test('Sequencer asks its input for the slot length', () => {
  const p = E.createPatch();
  const sweep = E.addComponent(p, 'Sweep');
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.props, { startA: 0, endA: 0.5, repeatA: false });
  E.connect(p, sweep.id, seq.id, 'sigA');
  const out = E.renderNode(p, seq.id, SR, SR);
  // The sweep spans 0..1 over the 0.5 s slot, not over the whole second.
  assert.ok(close(out[Math.round(0.25 * SR)], 0.5, 1e-3));
});
