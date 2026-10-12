const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../src/quack.js');

const RATE = 44100;

function peak(samples) {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

test('clampParams fills defaults for missing or invalid values', () => {
  const p = Q.clampParams({ pitch: 'abc' });
  for (const spec of Q.PARAM_SPECS) {
    assert.equal(p[spec.key], spec.default, spec.key);
  }
});

test('clampParams clamps to range and rounds integer params', () => {
  const p = Q.clampParams({ pitch: 99999, duration: -1, count: 2.6 });
  assert.equal(p.pitch, 1500);
  assert.equal(p.duration, 0.05);
  assert.equal(p.count, 3);
});

test('render length matches duration, count and gap', () => {
  const one = Q.render({ duration: 0.2, count: 1 }, RATE);
  assert.equal(one.length, Math.round(0.2 * RATE));

  const three = Q.render({ duration: 0.2, count: 3 }, RATE);
  const gap = Math.round(Q.GAP_SECONDS * RATE);
  assert.equal(three.length, 3 * Math.round(0.2 * RATE) + 2 * gap);
});

test('render output is finite and peaks at the requested volume', () => {
  for (const name of Object.keys(Q.PRESETS)) {
    const params = Q.PRESETS[name];
    const samples = Q.render(params, RATE);
    assert.ok(samples.every(Number.isFinite), name + ' has non-finite samples');
    assert.ok(Math.abs(peak(samples) - params.volume) < 1e-6, name + ' peak');
  }
});

test('render at zero volume is silent', () => {
  const samples = Q.render({ volume: 0 }, RATE);
  assert.equal(peak(samples), 0);
});

test('render is deterministic for the same seed', () => {
  const a = Q.render(Q.PRESETS['Mallard'], RATE, { seed: 42 });
  const b = Q.render(Q.PRESETS['Mallard'], RATE, { seed: 42 });
  assert.deepEqual(a, b);
});

test('render works at other sample rates', () => {
  const samples = Q.render({ duration: 0.1 }, 48000);
  assert.equal(samples.length, 4800);
});

test('randomParams stays within every spec range', () => {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) {
    const p = Q.randomParams(rng);
    for (const spec of Q.PARAM_SPECS) {
      assert.ok(p[spec.key] >= spec.min && p[spec.key] <= spec.max, spec.key);
    }
  }
});

test('presets only use known params within range', () => {
  const keys = new Set(Q.PARAM_SPECS.map((s) => s.key));
  for (const [name, preset] of Object.entries(Q.PRESETS)) {
    for (const key of Object.keys(preset)) assert.ok(keys.has(key), name + '.' + key);
    assert.deepEqual(Q.clampParams(preset), preset, name + ' is out of range');
  }
});

test('encodeWav writes a valid 16-bit mono PCM header', () => {
  const samples = new Float32Array([0, 0.5, -0.5, 1]);
  const wav = Q.encodeWav(samples, RATE);
  const view = new DataView(wav.buffer);
  const ascii = (off, len) => String.fromCharCode(...wav.slice(off, off + len));

  assert.equal(wav.length, 44 + samples.length * 2);
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(view.getUint32(4, true), 36 + samples.length * 2);
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(ascii(12, 4), 'fmt ');
  assert.equal(view.getUint16(20, true), 1);
  assert.equal(view.getUint16(22, true), 1);
  assert.equal(view.getUint32(24, true), RATE);
  assert.equal(view.getUint16(34, true), 16);
  assert.equal(ascii(36, 4), 'data');
  assert.equal(view.getUint32(40, true), samples.length * 2);
});

test('encodeWav converts and clips samples', () => {
  const wav = Q.encodeWav(new Float32Array([0, 1, -1, 2, -2]), RATE);
  const view = new DataView(wav.buffer);
  const at = (i) => view.getInt16(44 + i * 2, true);
  assert.equal(at(0), 0);
  assert.equal(at(1), 32767);
  assert.equal(at(2), -32768);
  assert.equal(at(3), 32767);
  assert.equal(at(4), -32768);
});
