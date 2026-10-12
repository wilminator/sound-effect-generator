const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Sawtooth starts at its lowest value and peaks at R/F', () => {
  const { p, c } = single('Sawtooth', { freq: 100, rf: 0.5 });
  const out = E.renderNode(p, c.id, 80, SR);
  assert.ok(close(out[0], -1));
  assert.ok(close(out[40], 1, 1e-3));
  assert.ok(close(out[20], 0, 1e-3));
});
