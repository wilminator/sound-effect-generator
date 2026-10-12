const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Modulator multiplies A by B', () => {
  const { p, c } = single('Modulator', { sigA: 3, sigB: -2 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], -6));
});
