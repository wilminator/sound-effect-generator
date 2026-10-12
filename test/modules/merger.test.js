const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Merger crossfades A·BA + B·(1−BA)', () => {
  const { p, c } = single('Merger', { sigA: 1, sigB: 0, ba: 0.25 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 0.25));
});
