const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/math-function.js');

const run = (expr, inputs, n = 100) => {
  const { p, c } = single('Math Function', inputs, { expr });
  return { out: E.renderNode(p, c.id, n, SR), p, c };
};

test('Math Function defaults and registration', () => {
  const { c } = single('Math Function');
  assert.equal(c.props.expr, 'sin(2*pi*440*t)');
  assert.equal(E.validate(single('Math Function').p).length, 0);
  assert.deepEqual(Object.keys(c.inputs), ['a', 'b', 'c', 'd']);
});

test('default expression is a 440 Hz sine of t', () => {
  const { p, c } = single('Math Function');
  const out = E.renderNode(p, c.id, 50, SR);
  for (const i of [0, 1, 7, 33]) assert.ok(close(out[i], Math.sin(2 * Math.PI * 440 * i / SR), 1e-5));
});

test('t and x variables; x = t / duration', () => {
  const { out } = run('t', {}, 80); // duration 80/8000 = 0.01 s
  assert.ok(close(out[40], 40 / SR));
  const { out: ox } = run('x', {}, 80);
  assert.ok(close(ox[0], 0));
  assert.ok(close(ox[40], 0.5));
  assert.ok(close(ox[79], 79 / 80));
});

test('inputs a..d are variables, unconnected ones are the constant values', () => {
  const { out } = run('a^b + c*10 - d', { a: 2, b: 3, c: 0.5, d: 1 }, 4);
  assert.ok(close(out[0], 8 + 5 - 1));
  const { out: z } = run('a+b+c+d', {}, 4);
  assert.equal(z[0], 0);
});

test('crossfade example from the help', () => {
  const { out } = run('a*(1-x) + b*x', { a: 1, b: 3 }, 100);
  assert.ok(close(out[0], 1));
  assert.ok(close(out[50], 2));
});

test('connected input signal varies per sample', () => {
  const p = E.createPatch();
  const sw = E.addComponent(p, 'Sweep');
  Object.assign(sw.props, { from: 0, to: 1 });
  const m = E.addComponent(p, 'Math Function');
  m.props.expr = 'a*a';
  E.normalize(p);
  E.connect(p, sw.id, m.id, 'a');
  const out = E.renderNode(p, m.id, 100, SR);
  assert.ok(close(out[50], 0.25, 1e-3));
  assert.ok(out[99] > out[50]);
});

test('validate reports syntax errors with position; wave-only variable p is rejected', () => {
  const { p, c } = single('Math Function', {}, { expr: '1 +' });
  const errs = E.validate(p);
  assert.equal(errs.length, 1);
  assert.match(errs[0].error, /position 4/);
  c.props.expr = 'p';
  assert.match(E.validate(p)[0].error, /Unknown variable "p"/);
  c.props.expr = 'sin(t)';
  assert.equal(E.validate(p).length, 0);
});

test('math errors are reported at render time with the component and time', () => {
  const { p, c } = single('Math Function', {}, { expr: '1/(floor(t*8000+0.5)-2)' });
  assert.equal(E.validate(p).length, 0);
  assert.throws(() => E.renderNode(p, c.id, 10, SR), /Math Function: Division by zero at t = 0.00025/);
  assert.throws(() => run('ln(a)', { a: 0 }, 5), /ln of 0/);
});

test('zero-length request', () => {
  const { out } = run('t', {}, 0);
  assert.equal(out.length, 0);
});

test('full patch via E.render', () => {
  const p = E.createPatch();
  const m = E.addComponent(p, 'Math Function');
  m.props.expr = '0.5*sin(2*pi*200*t)';
  E.normalize(p);
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.1, sampleRate: 8000 });
  E.connect(p, m.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels[0].length, 800);
  assert.ok(close(r.peak, 0.5, 0.01));
  m.props.expr = '1/0';
  assert.throws(() => E.render(p), /Division by zero/);
  m.props.expr = '1 +';
  assert.throws(() => E.render(p), /position 4/);
});
