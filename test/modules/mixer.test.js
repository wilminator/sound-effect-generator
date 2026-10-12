const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Mixer sums inputs times their volumes', () => {
  const { p, c } = single('Mixer', { sigA: 1, sigB: 2 }, { volA: 0.5, volB: 2 });
  const out = E.renderNode(p, c.id, 4, SR);
  assert.ok(close(out[0], 0.5 + 4));
});
