const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('ADSR passes through attack, decay, sustain and release', () => {
  const props = { attack: 0.1, peak: 1, decay: 0.1, sustain: 0.5, release: 0.2, curve: 'Linear', degree: 3 };
  const { p, c } = single('ADSR', { signal: 1 }, props);
  const out = E.renderNode(p, c.id, SR, SR);
  assert.equal(out[0], 0);
  assert.ok(close(out[Math.round(0.05 * SR)], 0.5, 1e-3));
  assert.ok(close(out[Math.round(0.1 * SR)], 1, 1e-3));
  assert.ok(close(out[Math.round(0.5 * SR)], 0.5));
  assert.ok(close(out[Math.round(0.9 * SR)], 0.25, 1e-3));
  assert.ok(out[SR - 1] < 0.01);
});

test('ADSR shrinks its stages when they are longer than the sound', () => {
  const env = E.TYPES.ADSR.envelope({ attack: 1, peak: 1, decay: 1, sustain: 0.5, release: 2, curve: 'Linear', degree: 3 }, 400, SR);
  assert.equal(env.length, 400);
  assert.ok(env.every(Number.isFinite));
  assert.ok(close(env[100], 1, 0.02)); // attack ends at a quarter of the way through
});
