const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Sine starts at 0 and follows sin(2πft)', () => {
  const { p, c } = single('Sine', { freq: 100 });
  const out = E.renderNode(p, c.id, 200, SR);
  assert.ok(close(out[0], 0));
  assert.ok(close(out[20], 1, 1e-4)); // quarter period of 100 Hz at 8 kHz
  assert.ok(close(out[40], 0, 1e-4));
});

test('oscillator Volume, Offset and Phase apply as Offset + Volume·shape(p)', () => {
  const { p, c } = single('Sine', { freq: 100, volume: 2, offset: 3, phase: 0.25 });
  const out = E.renderNode(p, c.id, 10, SR);
  assert.ok(close(out[0], 3 + 2 * 1, 1e-4));
});
