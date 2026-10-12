const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/envelope.js');
require('../../src/modules/sine.js');

const sec = (o) => Object.assign({ start: 0, sameAsPrevious: false, end: 1, duration: 1, curve: 'Linear', degree: 3 }, o);
const env = (sections, n, sr = SR) => E.TYPES.Envelope.envelope(sections, n, sr);

test('default is a ramp up then a ramp down', () => {
  const { p, c } = single('Envelope');
  const out = E.renderNode(p, c.id, SR, SR);
  assert.equal(out[0], 0);
  assert.ok(close(out[Math.round(0.05 * SR)], 0.5, 1e-3));
  assert.ok(close(out[Math.round(0.1 * SR)], 1, 1e-3));
  assert.ok(close(out[Math.round(0.3 * SR)], 0.5, 1e-3));
  assert.ok(close(out[SR - 1], 0)); // held at last end value
});

test('multiplies the Signal input', () => {
  const { p, c } = single('Envelope', { signal: 4 }, { sections: [sec({ start: 0.5, end: 0.5, duration: 1 })] });
  const out = E.renderNode(p, c.id, 100, SR);
  assert.ok(Array.from(out).every((v) => close(v, 2)));
});

test('linear section values, and sameAsPrevious takes the previous end', () => {
  const e = env([sec({ start: 0, end: 2, duration: 0.5 }), sec({ start: 99, sameAsPrevious: true, end: 0, duration: 0.5 })], SR);
  assert.ok(close(e[0], 0));
  assert.ok(close(e[2000], 1));
  assert.ok(close(e[4000], 2)); // start of section 2 = 2, not 99
  assert.ok(close(e[6000], 1));
  const e2 = env([sec({ start: 5, sameAsPrevious: true, end: 1, duration: 1 })], 10);
  assert.ok(close(e2[0], 5)); // first section uses its own start
});

test('curve types follow E.curve', () => {
  for (const curve of E.CURVES) {
    const e = env([sec({ start: 1, end: 3, duration: 1, curve, degree: 2 })], SR);
    const i = 2000;
    assert.ok(close(e[i], 1 + 2 * E.curve(curve, 2, i / SR), 1e-5), curve);
  }
  const slow = env([sec({ curve: 'Slow Start', degree: 3 })], SR);
  assert.ok(slow[SR / 2] < 0.5);
});

test('holds the last end value when sections are shorter than the sound', () => {
  const e = env([sec({ start: 0, end: 0.7, duration: 0.1 })], SR);
  assert.ok(close(e[SR - 1], 0.7));
  assert.ok(close(e[Math.round(0.1 * SR)], 0.7));
});

test('truncates sections that run past the sound', () => {
  const e = env([sec({ start: 0, end: 1, duration: 10 })], SR);
  assert.equal(e.length, SR);
  assert.ok(close(e[SR - 1], 0.1, 1e-3)); // only the first 1 s of a 10 s ramp
});

test('zero-duration sections are skipped but their end still feeds sameAsPrevious', () => {
  const e = env([sec({ end: 0.5, duration: 0 }), sec({ sameAsPrevious: true, end: 0.5, duration: 1 })], 10);
  assert.ok(close(e[0], 0.5));
  assert.ok(env([sec({ duration: -1 })], 5).every((v) => v === 1)); // negative duration skipped: empty envelope
});

test('empty sections give 1; zero length and junk values are safe', () => {
  assert.ok(Array.from(env([], 5)).every((v) => v === 1));
  assert.equal(env([sec({})], 0).length, 0);
  const junk = env([{ start: 'a', end: NaN, duration: 'x', curve: 'Nope', degree: NaN }, sec({})], 20);
  assert.ok(Array.from(junk).every(Number.isFinite));
});

test('shapes a sine in a full patch', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.5, sampleRate: SR });
  const sine = E.addComponent(p, 'Sine');
  const en = E.addComponent(p, 'Envelope');
  en.props.sections = [sec({ start: 0, end: 1, duration: 0.25 }), sec({ start: 1, end: 0, duration: 0.25 })];
  E.connect(p, sine.id, en.id, 'signal');
  E.connect(p, en.id, rec.id, 'signal');
  const r = E.render(p);
  const ch = r.channels[0];
  assert.equal(ch.length, 4000);
  let mid = 0, early = 0;
  for (let i = 1900; i < 2100; i++) mid = Math.max(mid, Math.abs(ch[i]));
  for (let i = 0; i < 200; i++) early = Math.max(early, Math.abs(ch[i]));
  assert.ok(mid > 0.9 * rec.props.volume * 0.9 && early < mid / 2);
});
