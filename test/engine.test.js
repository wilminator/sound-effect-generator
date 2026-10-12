const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/engine.js');
const EXAMPLES = require('../src/examples.js');

const SR = 8000;

function close(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

function peak(samples) {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

/** A patch with one component of `type` and the given inputs/props. */
function single(type, inputs = {}, props = {}) {
  const p = E.createPatch();
  const c = E.addComponent(p, type);
  Object.assign(c.inputs, inputs);
  Object.assign(c.props, props);
  return { p, c };
}

// ---------------------------------------------------------------- patch rules

test('a new patch has exactly one Recorder', () => {
  const p = E.createPatch();
  assert.equal(p.components.length, 1);
  assert.equal(E.getRecorder(p).type, 'Recorder');
  assert.throws(() => E.addComponent(p, 'Recorder'));
  assert.throws(() => E.removeComponent(p, E.getRecorder(p).id));
});

test('components get default names like Sine1, Sine2', () => {
  const p = E.createPatch();
  assert.equal(E.addComponent(p, 'Sine').name, 'Sine1');
  assert.equal(E.addComponent(p, 'Sine').name, 'Sine2');
  assert.equal(E.addComponent(p, 'Comb Filter').name, 'CombFilter1');
});

test('an output feeds one input: a new connection replaces the old one', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  const mixer = E.addComponent(p, 'Mixer');
  E.connect(p, sine.id, mixer.id, 'sigA');
  E.connect(p, sine.id, mixer.id, 'sigB');
  assert.equal(p.connections.length, 1);
  assert.equal(p.connections[0].input, 'sigB');
});

test('an input has one source: a new connection replaces the old one', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  const b = E.addComponent(p, 'Square');
  const rec = E.getRecorder(p);
  E.connect(p, a.id, rec.id, 'signal');
  E.connect(p, b.id, rec.id, 'signal');
  assert.equal(p.connections.length, 1);
  assert.equal(E.sourceOf(p, rec.id, 'signal').from, b.id);
});

test('invalid connections are rejected', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sweep');
  const b = E.addComponent(p, 'Sweep');
  const rec = E.getRecorder(p);
  assert.throws(() => E.connect(p, a.id, a.id, 'signal'), /itself/);
  assert.throws(() => E.connect(p, rec.id, a.id, 'signal'), /no output/);
  assert.throws(() => E.connect(p, a.id, b.id, 'nope'), /no input/);
  E.connect(p, a.id, b.id, 'signal');
  assert.throws(() => E.connect(p, b.id, a.id, 'signal'), /loop/);
});

test('removing a component removes its connections', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  E.connect(p, a.id, E.getRecorder(p).id, 'signal');
  E.removeComponent(p, a.id);
  assert.equal(p.connections.length, 0);
});

test('disconnectOutput and disconnectInput remove the connection', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  const rec = E.getRecorder(p);
  E.connect(p, a.id, rec.id, 'signal');
  E.disconnectOutput(p, a.id);
  assert.equal(p.connections.length, 0);
  E.connect(p, a.id, rec.id, 'signal');
  E.disconnectInput(p, rec.id, 'signal');
  assert.equal(p.connections.length, 0);
});

// ---------------------------------------------------------------- sources

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

test('Square starts high and honours M/S', () => {
  const { p, c } = single('Square', { freq: 100, ms: 0.25 });
  const out = E.renderNode(p, c.id, 80, SR); // one period = 80 samples
  assert.equal(out[0], 1);
  assert.equal(out[19], 1);
  assert.equal(out[21], -1);
  assert.equal(out[79], -1);
});

test('Sawtooth starts at its lowest value and peaks at R/F', () => {
  const { p, c } = single('Sawtooth', { freq: 100, rf: 0.5 });
  const out = E.renderNode(p, c.id, 80, SR);
  assert.ok(close(out[0], -1));
  assert.ok(close(out[40], 1, 1e-3));
  assert.ok(close(out[20], 0, 1e-3));
});

test('Noise is within ±Volume around Offset and repeatable', () => {
  const { p, c } = single('Noise', { volume: 0.5, offset: 1 });
  const a = E.renderNode(p, c.id, 1000, SR);
  const b = E.renderNode(p, c.id, 1000, SR);
  assert.deepEqual(a, b);
  for (const s of a) assert.ok(s >= 0.5 && s <= 1.5);
});

// ---------------------------------------------------------------- mixers

test('Mixer sums inputs times their volumes', () => {
  const { p, c } = single('Mixer', { sigA: 1, sigB: 2 }, { volA: 0.5, volB: 2 });
  const out = E.renderNode(p, c.id, 4, SR);
  assert.ok(close(out[0], 0.5 + 4));
});

test('Modulator multiplies A by B', () => {
  const { p, c } = single('Modulator', { sigA: 3, sigB: -2 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], -6));
});

test('Merger crossfades A·BA + B·(1−BA)', () => {
  const { p, c } = single('Merger', { sigA: 1, sigB: 0, ba: 0.25 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 0.25));
});

test('Music Modulator gives A=440 Hz in octave 5 and shifts by semitones', () => {
  const { p, c } = single('Music Modulator', { signal: 0 }, { note: 'A', octave: 5 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 440, 1e-3));
  c.inputs.signal = 12;
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 880, 1e-3));
  c.inputs.signal = 0;
  c.props.note = 'C';
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 261.6256, 1e-3));
});

test('Sequencer places an input between start and end, and can repeat', () => {
  const { p, c } = single('Sequencer', { sigA: 1 }, { startA: 0.25, endA: 0.5, repeatA: false });
  const out = E.renderNode(p, c.id, SR, SR); // 1 s
  assert.equal(out[0], 0);
  assert.equal(out[Math.round(0.3 * SR)], 1);
  assert.equal(out[Math.round(0.6 * SR)], 0);

  c.props.repeatA = true;
  const rep = E.renderNode(p, c.id, SR, SR);
  assert.equal(rep[Math.round(0.6 * SR)], 1);
  assert.equal(rep[Math.round(0.9 * SR)], 1);
});

test('Sequencer asks its input for the slot length', () => {
  const p = E.createPatch();
  const sweep = E.addComponent(p, 'Sweep');
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.props, { startA: 0, endA: 0.5, repeatA: false });
  E.connect(p, sweep.id, seq.id, 'sigA');
  const out = E.renderNode(p, seq.id, SR, SR);
  // The sweep spans 0..1 over the 0.5 s slot, not over the whole second.
  assert.ok(close(out[Math.round(0.25 * SR)], 0.5, 1e-3));
});

// ---------------------------------------------------------------- envelopes

test('Sweep ramps From → To over the requested duration', () => {
  const { p, c } = single('Sweep', { signal: 2 }, { from: 10, to: 20 });
  const out = E.renderNode(p, c.id, 100, SR);
  assert.ok(close(out[0], 20));
  assert.ok(close(out[50], 30));
});

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
  const env = E.adsrEnvelope({ attack: 1, peak: 1, decay: 1, sustain: 0.5, release: 2, curve: 'Linear', degree: 3 }, 400, SR);
  assert.equal(env.length, 400);
  assert.ok(env.every(Number.isFinite));
  assert.ok(close(env[100], 1, 0.02)); // attack ends at a quarter of the way through
});

test('envelope curves start at 0 and end at 1', () => {
  for (const type of E.CURVES) {
    assert.ok(close(E.curve(type, 3, 0), 0), type);
    assert.ok(close(E.curve(type, 3, 1), 1), type);
  }
  assert.ok(E.curve('Slow Start', 3, 0.5) < 0.5);
  assert.ok(E.curve('Fast Start', 3, 0.5) > 0.5);
});

// ---------------------------------------------------------------- filters

test('Comb Filter adds Strength·S(t − 1/Freq)', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer'); // a single impulse-ish block
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR, repeatA: false });
  const comb = E.addComponent(p, 'Comb Filter');
  Object.assign(comb.inputs, { freq: 100, strength: 0.5 });
  E.connect(p, seq.id, comb.id, 'signal');
  const out = E.renderNode(p, comb.id, 200, SR);
  assert.ok(close(out[0], 1));
  assert.ok(close(out[80], 0.5)); // 1/100 s = 80 samples later
  assert.ok(close(out[40], 0));
});

test('Echo repeats with feedback only when Repeating is on', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR, repeatA: false });
  const echo = E.addComponent(p, 'Echo');
  Object.assign(echo.inputs, { delay: 0.01, strength: 0.5 });
  E.connect(p, seq.id, echo.id, 'signal');

  const single = E.renderNode(p, echo.id, 300, SR);
  assert.ok(close(single[80], 0.5));
  assert.ok(close(single[160], 0));

  echo.props.multiple = true;
  const multi = E.renderNode(p, echo.id, 300, SR);
  assert.ok(close(multi[80], 0.5));
  assert.ok(close(multi[160], 0.25));
});

test('Echo delay is capped at Max Delay', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR });
  const echo = E.addComponent(p, 'Echo');
  Object.assign(echo.inputs, { delay: 1, strength: 1 });
  echo.props.maxDelay = 0.01;
  E.connect(p, seq.id, echo.id, 'signal');
  assert.ok(close(E.renderNode(p, echo.id, 200, SR)[80], 1));
});

test('Fuzz clips between Lower and Upper', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 100 });
  const fuzz = E.addComponent(p, 'Fuzz');
  Object.assign(fuzz.inputs, { upper: 0.5, lower: -0.25 });
  E.connect(p, sine.id, fuzz.id, 'signal');
  let out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(Math.max(...out) <= 0.5 && Math.min(...out) >= -0.25);
  assert.ok(close(Math.max(...out), 0.5) && close(Math.min(...out), -0.25));

  fuzz.props.symmetrical = true;
  out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(close(Math.min(...out), -0.5));

  fuzz.props.symmetrical = false;
  fuzz.props.forceZero = true;
  out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(close(Math.min(...out), 0) && close(Math.max(...out), 0.75));
});

test('Moving Average low-pass smooths and high-pass removes DC', () => {
  const lp = single('Moving Average', { signal: 1, strength: 1, width: 0.01 }, { mode: 'Low-pass' });
  const lpOut = E.renderNode(lp.p, lp.c.id, 200, SR);
  assert.ok(close(lpOut[199], 1));

  const hp = single('Moving Average', { signal: 1, strength: 1, width: 0.01 }, { mode: 'High-pass' });
  const hpOut = E.renderNode(hp.p, hp.c.id, 200, SR);
  assert.ok(close(hpOut[199], 0));
});

// ---------------------------------------------------------------- recorder, WAV, files

test('render uses the Recorder duration, sample rate and volume', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.5, sampleRate: 11025, volume: 0.5 });
  const sine = E.addComponent(p, 'Sine');
  E.connect(p, sine.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.sampleRate, 11025);
  assert.equal(r.samples.length, Math.round(0.5 * 11025));
  assert.ok(close(r.peak, 0.5, 1e-3));
  assert.equal(r.suggestedVolume, null);
});

test('render suggests a volume when the peak is outside 0.5–1', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  sine.inputs.volume = 4;
  E.connect(p, sine.id, E.getRecorder(p).id, 'signal');
  const r = E.render(p);
  assert.ok(r.peak > 1);
  assert.ok(close(r.suggestedVolume, 0.225, 1e-3));
});

test('an empty patch renders silence', () => {
  const r = E.render(E.createPatch());
  assert.equal(r.peak, 0);
  assert.equal(r.suggestedVolume, null);
});

test('encodeWav writes a valid 16-bit header and clips samples', () => {
  const wav = E.encodeWav(new Float32Array([0, 1, -1, 2]), 22050, 16);
  const v = new DataView(wav.buffer);
  const ascii = (o, n) => String.fromCharCode(...wav.slice(o, o + n));
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(v.getInt16(50, true), 32767);
});

test('encodeWav writes unsigned 8-bit samples', () => {
  const wav = E.encodeWav(new Float32Array([-1, 0, 1]), 8000, 8);
  const v = new DataView(wav.buffer);
  assert.equal(wav.length, 44 + 3);
  assert.equal(v.getUint16(34, true), 8);
  assert.equal(v.getUint16(32, true), 1);
  assert.deepEqual([...wav.slice(44)], [0, 128, 255]);
});

test('serialize and parse round-trip a patch', () => {
  const p = EXAMPLES['Wood block']();
  const q = E.parse(E.serialize(p));
  assert.deepEqual(q.components, p.components);
  assert.deepEqual(q.connections, p.connections);
  assert.deepEqual(E.render(q).samples, E.render(p).samples);
  // New components after loading get fresh ids.
  const added = E.addComponent(q, 'Sine');
  assert.ok(!p.components.some((c) => c.id === added.id));
});

test('parse rejects bad files and fills missing defaults', () => {
  assert.throws(() => E.parse('{}'));
  assert.throws(() => E.parse({ components: [{ id: 'c1', type: 'Bogus' }] }));
  assert.throws(() => E.parse({ components: [] }), /Recorder/);
  const q = E.parse({ components: [{ id: 'c1', type: 'Recorder' }, { id: 'c2', type: 'Sine' }] });
  assert.equal(E.getComponent(q, 'c2').inputs.freq, 400);
});

// ---------------------------------------------------------------- examples

test('every example renders finite, non-silent audio', () => {
  for (const [name, build] of Object.entries(EXAMPLES)) {
    const r = E.render(build());
    assert.ok(r.samples.every(Number.isFinite), name + ' has non-finite samples');
    assert.ok(r.peak > 0.05, name + ' is silent');
  }
});

// ---------------------------------------------------------------- seeds, Switch, Counter, Patch

test('Noise uses its own seed: same seed, same sound; new seed, new sound', () => {
  const { p, c } = single('Noise', {}, { seed: 42 });
  const a = E.renderNode(p, c.id, 500, SR);
  const copy = E.parse(E.serialize(p));
  assert.deepEqual(E.renderNode(copy, c.id, 500, SR), a);
  c.props.seed = 43;
  assert.notDeepEqual(E.renderNode(p, c.id, 500, SR), a);
});

test('new Noise components get different seeds', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Noise');
  const b = E.addComponent(p, 'Noise');
  assert.ok(Number.isInteger(a.props.seed));
  assert.notEqual(a.props.seed, b.props.seed);
});

test('Switch picks In floor(Select), clamped, and its inputs follow the channel count', () => {
  const { p, c } = single('Switch', {}, { channels: 3 });
  E.normalize(p);
  assert.deepEqual(E.inputsOf(c).map((i) => i.key), ['select', 'in0', 'in1', 'in2']);
  Object.assign(c.inputs, { in0: 10, in1: 20, in2: 30 });
  const at = (sel) => {
    c.inputs.select = sel;
    return E.renderNode(p, c.id, 1, SR)[0];
  };
  assert.equal(at(0), 10);
  assert.equal(at(1.9), 20);
  assert.equal(at(2), 30);
  assert.equal(at(7), 30);
  assert.equal(at(-3), 10);
  c.props.wrap = true;
  assert.equal(at(4), 20);
  assert.equal(at(-1), 30);
});

test('Switch switches as often as Select changes', () => {
  const p = E.createPatch();
  const gate = E.addComponent(p, 'Square');
  Object.assign(gate.inputs, { freq: 1000, volume: 0.5, offset: 0.5 }); // 0/1 every 4 samples
  const sw = E.addComponent(p, 'Switch');
  Object.assign(sw.inputs, { in0: -1, in1: 1 });
  E.connect(p, gate.id, sw.id, 'select');
  const out = E.renderNode(p, sw.id, SR, SR);
  let changes = 0;
  for (let i = 1; i < out.length; i++) if (out[i] !== out[i - 1]) changes++;
  assert.ok(changes >= 1990, 'only ' + changes + ' switches');
});

test('lowering the Switch input count drops connections to removed inputs', () => {
  const p = E.createPatch();
  const sw = E.addComponent(p, 'Switch');
  sw.props.channels = 4;
  E.normalize(p);
  const sine = E.addComponent(p, 'Sine');
  E.connect(p, sine.id, sw.id, 'in3');
  sw.props.channels = 2;
  E.normalize(p);
  assert.equal(p.connections.length, 0);
});

test('Counter adds Step on each positive edge and resets on Reset', () => {
  const p = E.createPatch();
  const gate = E.addComponent(p, 'Square');
  Object.assign(gate.inputs, { freq: 10 }); // starts high: +1 at t=0, then once per 0.1 s
  const counter = E.addComponent(p, 'Counter');
  Object.assign(counter.inputs, { step: 2 });
  counter.props.start = 5;
  E.connect(p, gate.id, counter.id, 'trigger');
  const out = E.renderNode(p, counter.id, SR, SR);
  assert.equal(out[0], 7);
  assert.equal(out[Math.round(0.05 * SR)], 7);
  assert.equal(out[Math.round(0.15 * SR)], 9);
  assert.equal(out[SR - 1], 5 + 2 * 10);

  const { p: q, c } = single('Counter', { trigger: 1, reset: 1 }, { start: 3 });
  assert.equal(E.renderNode(q, c.id, 10, SR)[9], 3); // reset wins over trigger
});

test('Patch plays a nested patch at the outer length and sample rate', () => {
  const inner = EXAMPLES['Simple tone']();
  const p = E.createPatch();
  const nested = E.addComponent(p, 'Patch');
  nested.props.patch = JSON.parse(E.serialize(inner));
  nested.inputs.volume = 0.5;
  const out = E.renderNode(p, nested.id, 4000, SR);
  assert.equal(out.length, 4000);
  const direct = E.renderNode(inner, E.getRecorder(inner).id, 4000, SR);
  assert.ok(close(out[123], direct[123] * 0.5));
});

test('an empty Patch is silent, and patches nest inside patches', () => {
  const { p, c } = single('Patch');
  assert.equal(peak(E.renderNode(p, c.id, 100, SR)), 0);

  const level1 = E.parse(E.serialize(p));
  E.getComponent(level1, c.id).props.patch = JSON.parse(E.serialize(EXAMPLES['Simple tone']()));
  E.connect(level1, c.id, E.getRecorder(level1).id, 'signal');
  const outer = E.createPatch();
  const wrap = E.addComponent(outer, 'Patch');
  wrap.props.patch = JSON.parse(E.serialize(level1));
  assert.ok(peak(E.renderNode(outer, wrap.id, 400, SR)) > 0.5);
});

test('a saved patch keeps nested patches and Switch inputs', () => {
  const p = EXAMPLES['Arpeggio']();
  const nest = E.addComponent(p, 'Patch');
  nest.props.patch = JSON.parse(E.serialize(EXAMPLES['Siren']()));
  const q = E.parse(E.serialize(p));
  assert.deepEqual(q.components, p.components);
  assert.deepEqual(q.connections, p.connections);
});
