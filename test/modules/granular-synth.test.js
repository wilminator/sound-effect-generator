const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, peak, single } = require('../helpers.js');
require('../../src/modules/granular-synth.js');

const TYPE = 'Granular Synth';
const render = (p, c, n) => E.renderNode(p, c.id, n, SR);

// One grain only: the gap is longer than the render.
const one = (inputs, props) =>
  single(TYPE, Object.assign({ gap: 100, volume: 1, duration: 0.1 }, inputs), Object.assign({ seed: 1 }, props));

test('same seed renders identically, different seed differs', () => {
  const inputs = { gap: 0.002, gapR: 0.001, volumeR: 0.5, durationR: 0.02, posR: 0.3 };
  const a = single(TYPE, inputs, { seed: 5 });
  const b = single(TYPE, inputs, { seed: 5 });
  const d = single(TYPE, inputs, { seed: 6 });
  const ra = render(a.p, a.c, SR);
  assert.deepEqual(ra, render(b.p, b.c, SR));
  assert.notDeepEqual(ra, render(d.p, d.c, SR));
  assert.ok(peak(ra) > 0);
});

test('new components get distinct integer seeds', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, TYPE);
  const b = E.addComponent(p, TYPE);
  assert.ok(Number.isInteger(a.props.seed));
  assert.notEqual(a.props.seed, b.props.seed);
});

test('single trapezoidal grain: ramps of Control * length, flat top, volume applied', () => {
  const { p, c } = one({ volume: 0.5 }, { shape: 'Trapezoidal', control: 0.25 });
  const out = render(p, c, SR); // grain is 800 samples
  for (let j = 0; j < 800; j++) {
    const u = j / 800;
    const e = u < 0.25 ? u / 0.25 : u > 0.75 ? (1 - u) / 0.25 : 1;
    assert.ok(close(out[j], 0.5 * e, 1e-5), `j=${j}`);
  }
  assert.equal(out[800], 0);
  assert.equal(out[SR - 1], 0);
});

test('trapezoid with control 0 is a rectangle; control above 0.5 acts as 0.5', () => {
  const r = one({}, { shape: 'Trapezoidal', control: 0 });
  const rect = render(r.p, r.c, 1000);
  assert.ok(rect.slice(0, 800).every((x) => x === 1));
  const t = one({}, { shape: 'Trapezoidal', control: 7 });
  const tri = render(t.p, t.c, 1000);
  assert.ok(close(tri[200], 0.5) && close(tri[400], 1) && close(tri[600], 0.5));
});

test('single Gaussian grain follows the bell', () => {
  const { p, c } = one({}, { shape: 'Gaussian', control: 1 });
  const out = render(p, c, 1000);
  for (const j of [0, 100, 399, 400, 600, 799]) {
    const x = (2 * j) / 800 - 1;
    assert.ok(close(out[j], Math.exp(-0.5 * (9 * x) ** 2), 1e-5), `j=${j}`);
  }
  assert.ok(close(out[400], 1));
  // a larger control pinches the bell
  const q = one({}, { shape: 'Gaussian', control: 3 });
  assert.ok(render(q.p, q.c, 1000)[500] < out[500]);
  // negative control flattens it
  const n = one({}, { shape: 'Gaussian', control: -0.5 });
  const flat = render(n.p, n.c, 1000);
  assert.ok(flat[500] > out[500] && flat[400] <= 1 && Number.isFinite(flat[0]));
});

test('single Attack/Decay grain: Control is the attack fraction', () => {
  const { p, c } = one({}, { shape: 'Attack/Decay', control: 0.1, curve: 'Linear' });
  const out = render(p, c, 1000);
  for (let j = 0; j < 800; j++) {
    const u = j / 800;
    const e = u < 0.1 ? u / 0.1 : 1 - (u - 0.1) / 0.9;
    assert.ok(close(out[j], e, 1e-5), `j=${j}`);
  }
  assert.ok(close(out[80], 1));
});

test('Attack/Decay honours the curve type and the extremes of Control', () => {
  const slow = one({}, { shape: 'Attack/Decay', control: 0.5, curve: 'Slow Start', degree: 3 });
  const out = render(slow.p, slow.c, 1000);
  const u = 100 / 800 / 0.5;
  assert.ok(close(out[100], (1 - Math.exp(3 * u)) / (1 - Math.exp(3)), 1e-5));
  const dec = one({}, { shape: 'Attack/Decay', control: 0 });
  assert.ok(close(render(dec.p, dec.c, 1000)[0], 1));
  const att = one({}, { shape: 'Attack/Decay', control: 5 });
  const a = render(att.p, att.c, 1000);
  assert.ok(close(a[400], 0.5) && Number.isFinite(a[799]));
});

test('grain timing follows Gap', () => {
  // 10-sample rectangular grains every 0.01 s = 80 samples
  const { p, c } = single(TYPE, { gap: 0.01, volume: 1, duration: 10 / SR }, { shape: 'Trapezoidal', control: 0 });
  const out = render(p, c, 400);
  for (let i = 0; i < 400; i++) assert.equal(out[i], i % 80 < 10 ? 1 : 0, `i=${i}`);
});

test('gap range varies spacing within value ± range', () => {
  const { p, c } = single(TYPE, { gap: 0.02, gapR: 0.01, volume: 1, duration: 1 / SR }, { shape: 'Trapezoidal', control: 0, seed: 9 });
  const out = render(p, c, 8000);
  const starts = [];
  out.forEach((x, i) => { if (x) starts.push(i); });
  assert.ok(starts.length > 20);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  assert.ok(gaps.every((g) => g >= 80 && g <= 240), gaps.join());
  assert.ok(new Set(gaps).size > 5);
});

test('overlapping grains are summed', () => {
  const { p, c } = single(TYPE, { gap: 0.0005, volume: 1, duration: 0.05 }, { shape: 'Trapezoidal', control: 0 });
  const out = render(p, c, 2000);
  assert.equal(out[1000], 100); // 400-sample grains every 4 samples
});

test('terminates quickly with tiny, zero and negative gaps and durations', () => {
  const t0 = Date.now();
  for (const inputs of [
    { gap: 0 }, { gap: -5 }, { gap: 1e-12, duration: 5 }, { gap: NaN }, { duration: -1 },
    { duration: 0 }, { duration: 1e9, gap: 0 }, { gap: 1e-9, gapR: 1e9, durationR: 1e9, posR: 1e9, volumeR: 1e9 }
  ]) {
    const { p, c } = single(TYPE, inputs, { sourceDuration: 1 });
    const out = E.renderNode(p, c.id, SR * 10, SR);
    assert.equal(out.length, SR * 10);
    assert.ok(out.every(Number.isFinite));
  }
  assert.ok(Date.now() - t0 < 20000, 'took ' + (Date.now() - t0) + ' ms');
});

test('zero-length render and zero Source Duration give silence', () => {
  const a = single(TYPE);
  assert.equal(render(a.p, a.c, 0).length, 0);
  const b = single(TYPE, {}, { sourceDuration: 0 });
  assert.ok(render(b.p, b.c, 100).every((x) => x === 0));
  const d = single(TYPE, {}, { sourceDuration: -3 });
  assert.ok(render(d.p, d.c, 100).every((x) => x === 0));
});

test('Pos selects the part of the stored Signal; past the end is silence', () => {
  const build = (pos, posR = 0, extra = {}) => {
    const p = E.createPatch();
    const g = E.addComponent(p, TYPE);
    Object.assign(g.props, { seed: 3, shape: 'Trapezoidal', control: 0, sourceDuration: 1 }, extra);
    E.normalize(p);
    Object.assign(g.inputs, { gap: 100, volume: 1, duration: 0.05, pos, posR });
    const seq = E.addComponent(p, 'Sequencer');
    Object.assign(seq.inputs, { sigA: 1 });
    Object.assign(seq.props, { startA: 0, endA: 0.5, repeatA: false });
    E.connect(p, seq.id, g.id, 'signal');
    return { p, g };
  };
  const first = build(0.1);
  assert.ok(render(first.p, first.g, 400).slice(0, 400).every((x) => x === 1));
  const second = build(0.7);
  assert.ok(render(second.p, second.g, 400).every((x) => x === 0));
  const edge = build(0.5 - 100 / SR); // first 100 samples of the grain are inside the signal
  const e = render(edge.p, edge.g, 400);
  assert.ok(e[50] === 1 && e[300] === 0);
  const past = build(5);
  assert.ok(render(past.p, past.g, 400).every((x) => x === 0));
});

test('Source Duration limits how much of the Signal is requested', () => {
  const p = E.createPatch();
  const g = E.addComponent(p, TYPE);
  g.props.sourceDuration = 0.25;
  g.props.control = 0;
  E.normalize(p);
  Object.assign(g.inputs, { gap: 100, volume: 1, duration: 1, pos: 0 });
  const out = render(p, g, SR);
  assert.equal(out[1999], 1);
  assert.equal(out[2000], 0);
});

test('end to end: Sine -> Granular Synth -> Recorder', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  sine.inputs.freq = 440;
  const g = E.addComponent(p, TYPE);
  g.props.seed = 11;
  g.props.shape = 'Gaussian';
  E.normalize(p);
  Object.assign(g.inputs, { gap: 0.002, gapR: 0.001, volume: 0.2, volumeR: 0.1, duration: 0.05, durationR: 0.02, pos: 0.5, posR: 0.5 });
  const rec = E.getRecorder(p);
  rec.props.duration = 0.5;
  E.connect(p, sine.id, g.id, 'signal');
  E.connect(p, g.id, rec.id, 'signal');
  const a = E.render(p);
  const b = E.render(p);
  assert.deepEqual(a.channels[0], b.channels[0]);
  assert.ok(a.peak > 0.05);
});
