const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, peak, single } = require('../helpers.js');

/** Peak of the last half of a Filter fed by a sine at `freq`. */
function response(mode, freq, cutoff, resonance = 0.707) {
  const { p, c } = single('Filter', { cutoff, resonance }, { mode });
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq, volume: 1 });
  E.connect(p, sine.id, c.id, 'signal');
  const out = E.renderNode(p, c.id, SR, SR);
  return peak(out.subarray(SR / 2));
}

test('Filter low-pass passes DC and lows, and cuts highs', () => {
  const dc = single('Filter', { signal: 1, cutoff: 200 }, { mode: 'Low-pass' });
  const out = E.renderNode(dc.p, dc.c.id, SR, SR);
  assert.ok(close(out[SR - 1], 1, 1e-3));
  assert.ok(response('Low-pass', 50, 1000) > 0.95);
  assert.ok(response('Low-pass', 3000, 200) < 0.02);
});

test('Filter high-pass removes DC and passes highs', () => {
  const dc = single('Filter', { signal: 1, cutoff: 200 }, { mode: 'High-pass' });
  const out = E.renderNode(dc.p, dc.c.id, SR, SR);
  assert.ok(Math.abs(out[SR - 1]) < 1e-3);
  assert.ok(response('High-pass', 3000, 200) > 0.95);
});

test('Filter band-pass peaks at the cutoff, notch removes it, resonance boosts low-pass', () => {
  assert.ok(close(response('Band-pass', 1000, 1000), 1, 0.02));
  assert.ok(response('Band-pass', 100, 1000, 5) < 0.1);
  assert.ok(response('Notch', 1000, 1000) < 0.02);
  assert.ok(response('Low-pass', 1000, 1000, 4) > 3.5);
});

test('Filter cutoff can change while it plays, and extreme values stay finite', () => {
  const { p, c } = single('Filter', { cutoff: 1e9, resonance: 0 }, { mode: 'Low-pass' });
  const noise = E.addComponent(p, 'Noise');
  E.connect(p, noise.id, c.id, 'signal');
  const sweep = E.addComponent(p, 'Sweep');
  Object.assign(sweep.props, { from: 100, to: 3000 });
  E.connect(p, sweep.id, c.id, 'cutoff');
  const out = E.renderNode(p, c.id, SR, SR);
  assert.ok(out.every(Number.isFinite));
  assert.ok(peak(out) > 0);
});
