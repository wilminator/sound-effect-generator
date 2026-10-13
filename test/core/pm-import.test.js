// Importing patch maps saved by the original Quack. The fixtures are the project owner's own
// .pm files; expected values were checked against screenshots of the same patches in Quack.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { E, close } = require('../helpers.js');
const { importPm } = require('../../src/core/pm-import.js');

const DIR = path.join(__dirname, '..', 'fixtures', 'pm');

function load(name) {
  const r = importPm(fs.readFileSync(path.join(DIR, name)));
  return { ...r, p: E.parse(r.patch) };
}

function byName(p, name) {
  const c = p.components.find((x) => x.name === name);
  assert.ok(c, 'missing ' + name);
  return c;
}

function source(p, to, input) {
  const k = p.connections.find((x) => x.to === byName(p, to).id && x.input === input);
  return k && E.getComponent(p, k.from).name;
}

test('every fixture imports with all its connections and renders', () => {
  for (const f of fs.readdirSync(DIR).filter((f) => f.endsWith('.pm'))) {
    const r = load(f);
    assert.deepEqual(r.warnings, [], f);
    assert.equal(r.p.connections.length, r.patch.connections.length, f + ': a connection was dropped');
    const out = E.render(r.p, { sampleRate: 8000 });
    assert.ok(out, f);
  }
});

test('Blobs Cast 2: Recorder, positions, sequencer, echo and wiring', () => {
  const { p } = load('Blobs-Cast-2.pm');
  const rec = E.getRecorder(p);
  assert.equal(rec.props.sampleRate, 44100);
  assert.equal(rec.props.bits, 16);
  assert.equal(rec.props.stereo, false);
  assert.ok(close(rec.props.duration, 1.75));
  assert.equal(rec.props.filename, 'segway');

  const seq = byName(p, 'Seq1');
  assert.deepEqual([seq.props.startB, seq.props.endB, seq.props.repeatB], [0.25, 0.5, false]);
  assert.equal(source(p, 'Seq1', 'sigA'), 'Square1');
  assert.equal(source(p, 'Seq1', 'sigC'), 'Square3');
  assert.equal(source(p, 'Mod1', 'sigB'), 'Square4');
  assert.equal(byName(p, 'Square4').inputs.freq, 12);

  const echo = byName(p, 'Echo1');
  assert.equal(echo.inputs.delay, 0.2);
  assert.equal(echo.inputs.strength, 0.6);
  assert.equal(echo.props.maxDelay, 0.4);
  assert.equal(echo.props.multiple, true);
});

test('Blobs Slash: sweeps feed the noise generator', () => {
  const { p } = load('Blobs-Slash.pm');
  const sweep = byName(p, 'Random Increase');
  assert.equal(sweep.type, 'Sweep');
  assert.deepEqual([sweep.props.from, sweep.props.to], [500, 2000]);
  assert.equal(source(p, 'Freq Generator', 'volume'), 'Random Increase');
  assert.equal(source(p, 'Freq Generator', 'offset'), 'Offset Sweep');
  assert.equal(source(p, 'SAH1', 'trigger'), 'Trigger');
  assert.equal(byName(p, 'Trigger').inputs.freq, 600);
});

test('HiSwish and Flames: ADSR settings match the Edit Adsr dialog', () => {
  const a = byName(load('HiSwish.pm').p, 'Adsr1').props;
  assert.deepEqual([a.attack, a.peak, a.decay, a.sustain, a.release, a.curve, a.degree], [0.1, 1, 0.1, 0.2, 0.1, 'Linear', 15]);
  const b = byName(load('Flames.pm').p, 'Adsr1').props;
  assert.deepEqual([b.attack, b.peak, b.decay, b.sustain, b.release, b.curve, b.degree], [0.1, 1, 0.2, 0.8, 0.5, 'Linear', 0]);
});

test('Flames: stereo Recorder and pan', () => {
  const { p } = load('Flames.pm');
  assert.equal(E.getRecorder(p).props.stereo, true);
  assert.equal(byName(p, 'MonoPan1').type, 'Mono to Stereo Pan');
  assert.equal(source(p, 'MonoPan1', 'pan'), 'Sweep1');
});

test('Fireball: envelope sections match the Edit Envelope dialog', () => {
  const s = byName(load('Fireball.pm').p, 'Envelope1').props.sections;
  assert.deepEqual(s.map((x) => [x.sameAsPrevious, x.end, x.duration, x.curve, x.degree]), [
    [true, 1, 0.1, 'Slow Start', -2],
    [true, 1, 0.1, 'Fast Start', 2],
    [true, 0, 0.3, 'Fast Start', 2]
  ]);
});

test('power: fuzz, mixer volumes and sawtooth', () => {
  const { p } = load('power.pm');
  const fuzz = byName(p, 'Fuzz1');
  assert.deepEqual([fuzz.inputs.upper, fuzz.inputs.lower, fuzz.props.symmetrical], [0.85, 0.15, true]);
  assert.equal(source(p, 'Fuzz1', 'signal'), 'Mod1');
  assert.equal(byName(p, 'Mixer1').props.volA, 1);
  assert.equal(source(p, 'Square2', 'freq'), 'Saw1');
  assert.equal(byName(p, 'Saw1').type, 'Sawtooth');
});

test('PatchMap: 8-bit Recorder', () => {
  const rec = E.getRecorder(load('PatchMap.pm').p);
  assert.equal(rec.props.bits, 8);
  assert.equal(rec.props.sampleRate, 11025);
});

test('rejects files that are not patch maps, and names unsupported components', () => {
  assert.throws(() => importPm(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])), /Not a Quack patch map/);
  const bytes = new Uint8Array(fs.readFileSync(path.join(DIR, 'HiSwish.pm')));
  // Rename the Noise class (same length) so the importer doesn't recognise it.
  const at = Buffer.from(bytes).indexOf('CSoundNoise');
  bytes.set(Buffer.from('CSoundComb!'), at);
  assert.throws(() => importPm(bytes), /CSoundComb! component/);
});
