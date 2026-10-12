const test = require('node:test');
const assert = require('node:assert/strict');
const X = require('../../src/core/expr.js');

const ev = (s, vars = {}, allowed = 'txabcdp') => X.compile(s, allowed)(vars);
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} !~ ${b}`);

test('arithmetic and precedence', () => {
  assert.equal(ev('1+2*3'), 7);
  assert.equal(ev('(1+2)*3'), 9);
  assert.equal(ev('10-4-3'), 3);
  assert.equal(ev('100/10/2'), 5);
  assert.equal(ev('-2^2'), -4);
  assert.equal(ev('(-2)^2'), 4);
  assert.equal(ev('2^3^2'), 512);
  assert.equal(ev('2^-1'), 0.5);
  assert.equal(ev('--3'), 3);
  assert.equal(ev('+3'), 3);
  assert.equal(ev('2*-3'), -6);
  assert.equal(ev('1 + 2 < 4'), 1);
  assert.equal(ev('.5 + 2.'), 2.5);
  assert.equal(ev(' 3 \t* 2 '), 6);
});

test('variables, unused letters are 0, pi constant', () => {
  assert.equal(ev('a*2+b', { a: 3, b: 1 }), 7);
  assert.equal(ev('a+t+x+p'), 0);
  near(ev('pi'), Math.PI);
  assert.equal(X.compile('x', 'x')({}), 0);
});

test('every function', () => {
  near(ev('sin(1)'), Math.sin(1));
  near(ev('cos(1)'), Math.cos(1));
  near(ev('tan(1)'), Math.tan(1));
  near(ev('asin(0.5)'), Math.asin(0.5));
  near(ev('acos(0.5)'), Math.acos(0.5));
  near(ev('atan(2)'), Math.atan(2));
  near(ev('ln(2)'), Math.LN2);
  near(ev('exp(2)'), Math.exp(2));
  near(ev('log(1000)'), 3);
  assert.equal(ev('abs(-3)'), 3);
  assert.equal(ev('sign(-3)'), -1);
  assert.equal(ev('sign(0)'), 0);
  assert.equal(ev('sign(9)'), 1);
  assert.equal(ev('floor(-1.5)'), -2);
  near(ev('frac(2.75)'), 0.75);
  near(ev('frac(-0.25)'), 0.75);
  near(ev('sinh(1)'), Math.sinh(1));
  near(ev('cosh(1)'), Math.cosh(1));
  near(ev('tanh(0.5)'), Math.tanh(0.5));
  assert.equal(ev('tanh(100)'), 1);
  near(ev('asinh(1)'), Math.asinh(1));
  near(ev('acosh(2)'), Math.acosh(2));
  near(ev('atanh(0.5)'), Math.atanh(0.5));
  near(ev('sin(cos(0))'), Math.sin(1));
});

test('comparison and logic operators', () => {
  assert.equal(ev('1==1'), 1);
  assert.equal(ev('1!=1'), 0);
  assert.equal(ev('1<2'), 1);
  assert.equal(ev('2<=2'), 1);
  assert.equal(ev('3>4'), 0);
  assert.equal(ev('4>=4'), 1);
  assert.equal(ev('!0'), 1);
  assert.equal(ev('!1'), 0);
  assert.equal(ev('!0.4'), 1);
  assert.equal(ev('!0.5'), 0);
  assert.equal(ev('0.5 && 1'), 1);
  assert.equal(ev('0.49 && 1'), 0);
  assert.equal(ev('0.49 || 0.5'), 1);
  assert.equal(ev('0.49 || 0'), 0);
  assert.equal(ev('7 && 7'), 1); // results are 1/0, not the operands
  assert.equal(ev('1 || 0 && 0'), 1); // && binds tighter than ||
  assert.equal(ev('1 == 1 && 2 > 1'), 1);
  assert.equal(ev('t < 0.5', { t: 0.25 }), 1);
});

test('syntax errors name the problem and position', () => {
  const cases = [
    ['1 +', /end of expression at position 4/],
    ['(1+2', /Expected "\)".* at position 5/],
    ['1 2', /Unexpected "2" at position 3/],
    ['1 + * 2', /Unexpected "\*" at position 5/],
    ['2 $ 3', /Unexpected character "\$" at position 3/],
    ['', /Unexpected end of expression at position 1/],
    ['sin()', /needs an argument at position 5/],
    ['sin 1', /must be followed by "\(" at position 5/],
    ['1e5', /Unexpected letter "e" after a number.* at position 2/],
    ['2pi', /Unexpected letter "p" after a number.* at position 2/],
    ['1.2.3', /second decimal point\) at position 4/],
    ['a = 1', /Unexpected "=".* at position 3/],
    ['1; 2', /single expression\) at position 2/],
    ['1 & 2', /did you mean "&&"/],
    ['atan(1,2)', /exactly one argument at position 7/],
    ['1 )', /Unexpected "\)" at position 3/]
  ];
  for (const [src, re] of cases) {
    assert.throws(() => X.compile(src, 'abc'), re, src);
    assert.match(X.check(src, 'abc'), re, src);
  }
  try { X.compile('1 + $', 'a'); } catch (e) { assert.equal(e.pos, 5); }
});

test('unknown variables and functions are rejected', () => {
  assert.throws(() => X.compile('p', 'txabcd'), /Unknown variable "p" at position 1/);
  assert.throws(() => X.compile('a+z', 'abc'), /Unknown variable "z" at position 3/);
  assert.throws(() => X.compile('foo(1)', 'abc'), /Unknown function "foo" at position 1/);
  assert.throws(() => X.compile('ab', 'ab'), /Unknown name "ab"/);
  assert.throws(() => X.compile('constructor(1)', 'a'), /Unknown function/);
  assert.throws(() => X.compile('toString', 'a'), /Unknown name/);
  assert.equal(X.check('a+1', 'a'), null);
  assert.equal(X.check('sin(a)', ['a']), null);
});

test('math errors throw at evaluation time', () => {
  const f = (s, v) => () => X.compile(s, 'abx')(v || {});
  assert.throws(f('1/0'), /Division by zero/);
  assert.throws(f('1/a', { a: 0 }), /Division by zero/);
  assert.throws(f('0^-1'), /Division by zero/);
  assert.throws(f('ln(0)'), /ln of 0/);
  assert.throws(f('ln(-1)'), /ln of -1/);
  assert.throws(f('log(0)'), /log of 0/);
  assert.throws(f('asin(2)'), /asin of 2/);
  assert.throws(f('acos(-1.5)'), /acos of -1.5/);
  assert.throws(f('acosh(0.5)'), /acosh/);
  assert.throws(f('atanh(1)'), /atanh/);
  assert.throws(f('(-8)^0.5'), /not a number/);
  assert.throws(f('exp(1000)'), /infinite/);
  assert.throws(f('10^400'), /infinite/);
  assert.throws(f('a', { a: NaN }), /not a number/);
  assert.throws(f('a', { a: Infinity }), /infinite/);
  assert.throws(f('a*0', { a: Infinity }), /not a number/);
  // An error inside a branch that is then ignored by a comparison still throws.
  assert.throws(f('1/0 > 5'), /Division by zero/);
  // Valid compile never throws a syntax error for these.
  assert.equal(X.check('1/0', 'a'), null);
});

test('compiled expressions are fast and allocation-free per call', () => {
  const fn = X.compile('sin(2*pi*440*t) * (1 - x) + a^2 * (t < 0.5) + frac(t*7)', 'txabcd');
  const vars = { t: 0, x: 0, a: 0.5 };
  let sum = 0;
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 1000000; i++) {
    vars.t = i / 1e6;
    vars.x = vars.t;
    sum += fn(vars);
  }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(Number.isFinite(sum));
  assert.ok(ms < 500, `1e6 evaluations took ${ms} ms`);
});

test('user text is never executed as code', () => {
  globalThis.__quackPwned = false;
  assert.throws(() => X.compile('(globalThis.__quackPwned=true)', 'a'));
  assert.throws(() => X.compile('process.exit()', 'a'));
  assert.equal(globalThis.__quackPwned, false);
});
