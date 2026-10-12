const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, peak, single } = require('../helpers.js');
require('../../src/modules/fourier-wave.js');
require('../../src/modules/sine.js');

const def = () => E.TYPES['Fourier Wave'];
const act = (label) => def().actions.find((a) => a.label === label);
const mk = (rows, inputs = {}) => single('Fourier Wave', inputs, { harmonics: rows });

test('default is a single sine harmonic', () => {
  const { p, c } = single('Fourier Wave', { freq: 100 });
  assert.deepEqual(c.props.harmonics, [{ order: 1, amp: 1, phase: 0 }]);
  const out = E.renderNode(p, c.id, 200, SR);
  for (let i = 0; i < 200; i += 7) assert.ok(close(out[i], Math.sin(2 * Math.PI * 100 * i / SR), 1e-4));
});

test('sums harmonics: amp, order multiplier and phase', () => {
  const rows = [{ order: 1, amp: 0.5, phase: 0 }, { order: 3, amp: 0.25, phase: 0.25 }];
  const { p, c } = mk(rows, { freq: 50, volume: 2, offset: 0.1 });
  const out = E.renderNode(p, c.id, 400, SR);
  for (let i = 0; i < 400; i += 11) {
    const x = 50 * i / SR;
    const want = 0.1 + 2 * (0.5 * Math.sin(2 * Math.PI * x) + 0.25 * Math.sin(2 * Math.PI * (3 * x + 0.25)));
    assert.ok(close(out[i], want, 1e-4), `sample ${i}`);
  }
});

test('phase input shifts all harmonics by the oscillator phase', () => {
  const { p, c } = mk([{ order: 2, amp: 1, phase: 0 }], { freq: 0, phase: 0.125 });
  const out = E.renderNode(p, c.id, 4, SR);
  assert.ok(close(out[0], Math.sin(2 * Math.PI * 0.25), 1e-6));
});

test('empty table is silent, zero-length and NaN safe', () => {
  const { p, c } = mk([]);
  assert.equal(peak(E.renderNode(p, c.id, 100, SR)), 0);
  assert.equal(E.renderNode(p, c.id, 0, SR).length, 0);
  const t = mk([{ order: 1, amp: NaN, phase: 'x' }]);
  assert.ok(E.renderNode(t.p, t.c.id, 50, SR).every(Number.isFinite));
});

test('validate rejects bad orders and too many rows', () => {
  const v = (rows) => def().validate({ props: { harmonics: rows } });
  assert.equal(v([{ order: 1, amp: 1, phase: 0 }, { order: 4095, amp: 1, phase: 0 }]), null);
  assert.match(v([{ order: 0, amp: 1, phase: 0 }]), /order/);
  assert.match(v([{ order: 4096, amp: 1, phase: 0 }]), /order/);
  assert.match(v([{ order: 1.5, amp: 1, phase: 0 }]), /order/);
  assert.match(v([{ order: NaN, amp: 1, phase: 0 }]), /order/);
  const many = Array.from({ length: 4096 }, () => ({ order: 1, amp: 1, phase: 0 }));
  assert.match(v(many), /4095/);
  assert.equal(v(many.slice(0, 4095)), null);
});

test('Normalise brings the peak to 1', () => {
  const { c } = mk([{ order: 1, amp: 3, phase: 0 }]);
  act('Normalise').run(c, {});
  assert.ok(close(c.props.harmonics[0].amp, 1, 1e-4));

  const c2 = mk([{ order: 1, amp: 1, phase: 0 }, { order: 3, amp: 0.7, phase: 0.2 }, { order: 40, amp: 0.4, phase: 0.6 }]).c;
  act('Normalise').run(c2, {});
  let pk = 0;
  for (let i = 0; i < 200000; i++) {
    const x = i / 200000;
    pk = Math.max(pk, Math.abs(c2.props.harmonics.reduce((s, r) => s + r.amp * Math.sin(2 * Math.PI * (r.order * x + r.phase)), 0)));
  }
  assert.ok(close(pk, 1, 1e-3), `peak ${pk}`);
  assert.ok(pk <= 1 + 1e-6);
});

test('Normalise handles high orders and leaves silent tables alone', () => {
  const c = mk([{ order: 4000, amp: 5, phase: 0 }, { order: 1, amp: 5, phase: 0 }]).c;
  act('Normalise').run(c, {});
  assert.ok(c.props.harmonics[0].amp < 1 && c.props.harmonics[0].amp > 0.4);
  const z = mk([{ order: 1, amp: 0, phase: 0 }]).c;
  act('Normalise').run(z, {});
  assert.equal(z.props.harmonics[0].amp, 0);
  const e = mk([]).c;
  act('Normalise').run(e, {});
  assert.deepEqual(e.props.harmonics, []);
});

test('Add series generates a/n^b for first..last by step, phase 0', () => {
  const c = mk([]).c;
  act('Add series').run(c, { values: { a: 1, b: 1, first: 1, last: 7, step: 2 } });
  assert.deepEqual(c.props.harmonics.map((r) => r.order), [1, 3, 5, 7]);
  assert.deepEqual(c.props.harmonics.map((r) => r.amp), [1, 1 / 3, 1 / 5, 1 / 7]);
  assert.ok(c.props.harmonics.every((r) => r.phase === 0));
  assert.equal(act('Add series').fields.length, 5);
  assert.deepEqual(act('Add series').fields.map((f) => f.default), [1, 1, 1, 15, 2]);
});

test('Add series keeps other rows, replaces the same order, and validates input', () => {
  const c = mk([{ order: 2, amp: 9, phase: 0.5 }, { order: 3, amp: 9, phase: 0.5 }]).c;
  act('Add series').run(c, { values: { a: 2, b: 2, first: 3, last: 4, step: 1 } });
  assert.deepEqual(c.props.harmonics, [
    { order: 2, amp: 9, phase: 0.5 }, { order: 3, amp: 2 / 9, phase: 0 }, { order: 4, amp: 2 / 16, phase: 0 }]);
  const run = (values) => () => act('Add series').run(c, { values });
  assert.throws(run({ a: 1, b: 1, first: 1, last: 5000, step: 1 }), /last/);
  assert.throws(run({ a: 1, b: 1, first: 0, last: 5, step: 1 }), /first/);
  assert.throws(run({ a: 1, b: 1, first: 1, last: 5, step: 0 }), /step/);
  assert.throws(run({ a: 'x', b: 1, first: 1, last: 5, step: 1 }), /numbers/);
});

test('Import parses lines and replaces the table', () => {
  const c = mk([{ order: 9, amp: 1, phase: 0 }]).c;
  act('Import').run(c, { text: '1 1.0 0.0\r\n3 0.3333333 0.0\n\n  5\t0.2   0.5  \n' });
  assert.deepEqual(c.props.harmonics, [
    { order: 1, amp: 1, phase: 0 }, { order: 3, amp: 0.3333333, phase: 0 }, { order: 5, amp: 0.2, phase: 0.5 }]);
  assert.equal(act('Import').file, 'text');
});

test('Import also accepts the help-text example on one line per harmonic and rejects bad lines', () => {
  const c = mk([{ order: 9, amp: 1, phase: 0 }]).c;
  const bad = (text, re) => assert.throws(() => act('Import').run(c, { text }), re);
  bad('1 1 0\n2 abc 0', /line 2.*2 abc 0/);
  bad('1 1', /line 1/);
  bad('1 1 0 0', /line 1/);
  bad('0 1 0', /line 1.*order/);
  bad('1.5 1 0', /order/);
  bad('4096 1 0', /order/);
  bad('1 1 2', /phase/);
  assert.deepEqual(c.props.harmonics, [{ order: 9, amp: 1, phase: 0 }]); // unchanged after errors
  act('Import').run(c, { text: '' });
  assert.deepEqual(c.props.harmonics, []);
});

test('square-wave series in a full patch renders and normalises', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.1, sampleRate: SR });
  const f = E.addComponent(p, 'Fourier Wave');
  f.inputs.freq = 200;
  act('Add series').run(f, { values: { a: 1, b: 1, first: 3, last: 99, step: 2 } });
  act('Normalise').run(f, {});
  E.connect(p, f.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels[0].length, 800);
  assert.ok(r.peak > 0.5 && r.peak <= 1.0001);
  // the help's 3-harmonic square approximation is positive in the first half cycle
  const s = mk([{ order: 1, amp: 1, phase: 0 }, { order: 3, amp: 1 / 3, phase: 0 }, { order: 5, amp: 0.2, phase: 0 }], { freq: 100 });
  const out = E.renderNode(s.p, s.c.id, 80, SR);
  assert.ok(out[20] > 0.5 && out[60] < -0.5);
});
