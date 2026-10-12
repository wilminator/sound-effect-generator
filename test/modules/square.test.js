const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, single } = require('../helpers.js');

test('Square starts high and honours M/S', () => {
  const { p, c } = single('Square', { freq: 100, ms: 0.25 });
  const out = E.renderNode(p, c.id, 80, SR); // one period = 80 samples
  assert.equal(out[0], 1);
  assert.equal(out[19], 1);
  assert.equal(out[21], -1);
  assert.equal(out[79], -1);
});
