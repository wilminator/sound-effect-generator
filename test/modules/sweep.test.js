const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Sweep ramps From → To over the requested duration', () => {
  const { p, c } = single('Sweep', { signal: 2 }, { from: 10, to: 20 });
  const out = E.renderNode(p, c.id, 100, SR);
  assert.ok(close(out[0], 20));
  assert.ok(close(out[50], 30));
});
