const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/wave-function.js');
require('../../src/modules/sine.js');

const run = (expr, inputs, n = 100) => {
  const { p, c } = single('Wave Function', inputs, { expr });
  return E.renderNode(p, c.id, n, SR);
};

test('Wave Function defaults to a sine, identical to the Sine component', () => {
  const w = single('Wave Function', { freq: 123, volume: 0.7, offset: 0.1, phase: 0.2 });
  const s = single('Sine', { freq: 123, volume: 0.7, offset: 0.1, phase: 0.2 });
  assert.equal(w.c.props.expr, 'sin(2*pi*p)');
  const a = E.renderNode(w.p, w.c.id, 300, SR);
  const b = E.renderNode(s.p, s.c.id, 300, SR);
  for (let i = 0; i < 300; i++) assert.ok(close(a[i], b[i], 1e-6), 'sample ' + i);
});

test('p is the normalised phase: saw from p', () => {
  const out = run('2*p-1', { freq: 100 }, 80);
  assert.ok(close(out[0], -1));
  assert.ok(close(out[1], 2 * (100 / SR) - 1));
  assert.ok(close(out[40], 2 * 0.5 - 1, 1e-4));
  assert.ok(close(out[80 - 1], 2 * (79 * 100 / SR % 1) - 1, 1e-4));
});

test('Offset + Volume * f(...)', () => {
  const out = run('p', { freq: 100, volume: 2, offset: 3, phase: 0.25 }, 5);
  assert.ok(close(out[0], 3 + 2 * 0.25));
});

test('t, x and a..d variables', () => {
  const out = run('t + x*10 + a + b*2 + c*3 + d*4', { freq: 0, a: 1, b: 1, c: 1, d: 1 }, 80);
  assert.ok(close(out[0], 10));
  assert.ok(close(out[40], 40 / SR + 5 + 10, 1e-4));
});

test('freq 0 holds phase 0; phase input shifts p', () => {
  const out = run('p', { freq: 0, phase: 0.6 }, 5);
  assert.ok(close(out[3], 0.6));
});

test('validate: syntax errors and unknown variables', () => {
  const { p, c } = single('Wave Function', {}, { expr: 'sin(' });
  assert.match(E.validate(p)[0].error, /position 5/);
  c.props.expr = 'sin(q)';
  assert.match(E.validate(p)[0].error, /Unknown variable "q"/);
  c.props.expr = 'p*t*x*a*b*c*d';
  assert.equal(E.validate(p).length, 0);
});

test('math errors at render time', () => {
  assert.throws(() => run('1/(p-p)', { freq: 10 }, 5), /Wave Function: Division by zero at t = 0/);
  assert.throws(() => run('ln(p)', { freq: 10 }, 5), /ln of 0/);
});

test('zero-length request', () => {
  assert.equal(run('p', {}, 0).length, 0);
});

test('full patch: Wave Function frequency-modulated by another Wave Function', () => {
  const p = E.createPatch();
  const lfo = E.addComponent(p, 'Wave Function');
  Object.assign(lfo.props, { expr: 'sin(2*pi*p)' });
  const w = E.addComponent(p, 'Wave Function');
  w.props.expr = 'sin(2*pi*p) * (1 - x)';
  E.normalize(p);
  Object.assign(lfo.inputs, { freq: 5, volume: 50, offset: 440 });
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.2, sampleRate: 8000 });
  E.connect(p, lfo.id, w.id, 'freq');
  E.connect(p, w.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels[0].length, 1600);
  assert.ok(r.peak > 0.5 && r.peak <= 1);
  assert.ok(Math.abs(r.channels[0][1599]) < 0.01); // faded out by (1 - x)
});
