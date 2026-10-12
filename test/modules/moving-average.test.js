const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Moving Average low-pass smooths and high-pass removes DC', () => {
  const lp = single('Moving Average', { signal: 1, strength: 1, width: 0.01 }, { mode: 'Low-pass' });
  const lpOut = E.renderNode(lp.p, lp.c.id, 200, SR);
  assert.ok(close(lpOut[199], 1));

  const hp = single('Moving Average', { signal: 1, strength: 1, width: 0.01 }, { mode: 'High-pass' });
  const hpOut = E.renderNode(hp.p, hp.c.id, 200, SR);
  assert.ok(close(hpOut[199], 0));
});
