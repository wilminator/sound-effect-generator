const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, single } = require('../helpers.js');

test('Counter adds Step on each positive edge and resets on Reset', () => {
  const p = E.createPatch();
  const gate = E.addComponent(p, 'Square');
  Object.assign(gate.inputs, { freq: 10 }); // starts high: +1 at t=0, then once per 0.1 s
  const counter = E.addComponent(p, 'Counter');
  Object.assign(counter.inputs, { step: 2 });
  counter.props.start = 5;
  E.connect(p, gate.id, counter.id, 'trigger');
  const out = E.renderNode(p, counter.id, SR, SR);
  assert.equal(out[0], 7);
  assert.equal(out[Math.round(0.05 * SR)], 7);
  assert.equal(out[Math.round(0.15 * SR)], 9);
  assert.equal(out[SR - 1], 5 + 2 * 10);

  const { p: q, c } = single('Counter', { trigger: 1, reset: 1 }, { start: 3 });
  assert.equal(E.renderNode(q, c.id, 10, SR)[9], 3); // reset wins over trigger
});
