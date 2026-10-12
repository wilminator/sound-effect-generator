// End-to-end: build patches from the original help file's techniques, render them,
// save and reload them, and export them through every built-in encoder.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { E, close, peak } = require('../helpers.js');
const { encodeWav, decodeWav } = require('../../src/core/wav.js');
const { encodeFlac } = require('../../src/core/flac.js');
const EXAMPLES = require('../../src/examples.js');

function has(cmd) {
  try {
    execFileSync(cmd, ['-version'], { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}
const FFMPEG = has('ffmpeg');

/** Decodes any audio file with ffmpeg to mono 16-bit PCM at its own rate. */
function ffmpegDecode(bytes, ext) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quack-'));
  const file = path.join(dir, 'in.' + ext);
  fs.writeFileSync(file, bytes);
  const out = execFileSync('ffmpeg', ['-nostdin', '-v', 'error', '-i', file, '-f', 's16le', '-acodec', 'pcm_s16le', '-'], { maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'pipe'] });
  fs.rmSync(dir, { recursive: true, force: true });
  return new Int16Array(out.buffer, out.byteOffset, out.length / 2);
}

function build(spec) {
  const p = E.createPatch();
  const ids = {};
  for (const [name, [type, inputs = {}, props = {}]] of Object.entries(spec.parts)) {
    const c = E.addComponent(p, type);
    Object.assign(c.props, props);
    E.normalize(p);
    Object.assign(c.inputs, inputs);
    ids[name] = c.id;
  }
  for (const [from, to, input] of spec.wires) E.connect(p, ids[from], to === 'rec' ? E.getRecorder(p).id : ids[to], input);
  Object.assign(E.getRecorder(p).props, spec.recorder || {});
  return { p, ids };
}

test('siren: a slow sawtooth sweeps a square wave between 100 and 1100 Hz', () => {
  const { p, ids } = build({
    parts: {
      lfo: ['Sawtooth', { freq: 2, offset: 600, volume: 500, rf: 0.1 }],
      sq: ['Square', { volume: 0.5 }]
    },
    wires: [['lfo', 'sq', 'freq'], ['sq', 'rec', 'signal']],
    recorder: { duration: 1, sampleRate: 8000 }
  });
  const r = E.render(p, { taps: true });
  const lfo = r.taps[ids.lfo];
  assert.ok(close(Math.min(...lfo), 100, 1) && close(Math.max(...lfo), 1100, 2));
  assert.ok(close(r.peak, 0.5));
});

test('delayed vibrato: a Sweep scales the vibrato depth from nothing', () => {
  const { p, ids } = build({
    parts: {
      depth: ['Sweep', { signal: 20 }, { from: 0, to: 1 }],
      lfo: ['Sine', { freq: 6, offset: 400 }],
      osc: ['Sine', { volume: 0.8 }]
    },
    wires: [['depth', 'lfo', 'volume'], ['lfo', 'osc', 'freq'], ['osc', 'rec', 'signal']],
    recorder: { duration: 1, sampleRate: 8000 }
  });
  const f = E.render(p, { taps: true }).taps[ids.lfo];
  const early = f.slice(0, 800);
  const late = f.slice(6000);
  assert.ok(Math.max(...early) - Math.min(...early) < 5);
  assert.ok(Math.max(...late) - Math.min(...late) > 30);
});

test('tom-tom: a short attack-decay envelope ends in silence', () => {
  const { p } = build({
    parts: {
      sweep: ['Sweep', {}, { from: 200, to: 300 }],
      osc: ['Sine'],
      env: ['ADSR', {}, { attack: 0.005, decay: 0.45, sustain: 0, release: 0 }]
    },
    wires: [['sweep', 'osc', 'freq'], ['osc', 'env', 'signal'], ['env', 'rec', 'signal']],
    recorder: { duration: 0.5, sampleRate: 8000 }
  });
  const s = E.render(p).channels[0];
  assert.ok(peak(s.slice(0, 400)) > 0.8);
  assert.ok(peak(s.slice(3700)) < 0.02);
});

test('musically linear sweep: Sweep 0→24 through a Music Modulator spans two octaves', () => {
  const { p, ids } = build({
    parts: {
      sweep: ['Sweep', {}, { from: 0, to: 24 }],
      music: ['Music Modulator', {}, { note: 'A', octave: 5 }],
      osc: ['Square', { volume: 0.5 }]
    },
    wires: [['sweep', 'music', 'signal'], ['music', 'osc', 'freq'], ['osc', 'rec', 'signal']],
    recorder: { duration: 1, sampleRate: 8000 }
  });
  const f = E.render(p, { taps: true }).taps[ids.music];
  assert.ok(close(f[0], 440, 1e-3));
  assert.ok(close(f[4000], 880, 0.1));
  assert.ok(f[7999] > 1755 && f[7999] < 1760);
});

test('sequencer limits a long chain to its slot (the phase-distortion tutorial)', () => {
  const { p, ids } = build({
    parts: {
      sweep: ['Sweep'],
      seq: ['Sequencer', {}, { startA: 0, endA: 0.1 }],
      echo: ['Echo', { delay: 0.15, strength: 0.5 }]
    },
    wires: [['sweep', 'seq', 'sigA'], ['seq', 'echo', 'signal'], ['echo', 'rec', 'signal']],
    recorder: { duration: 0.5, sampleRate: 8000 }
  });
  const r = E.render(p, { taps: true });
  assert.equal(r.taps[ids.sweep].length, 800); // the sweep was asked for 0.1 s, not 0.5 s
  const out = r.channels[0];
  assert.ok(close(out[799], 799 / 800, 1e-3));
  assert.ok(close(out[1200 + 799], 0.5 * 799 / 800, 1e-3)); // the echo, 0.15 s later
});

test('every example survives save, reload and render unchanged', () => {
  for (const [name, buildExample] of Object.entries(EXAMPLES)) {
    const p = buildExample();
    const q = E.parse(E.serialize(p));
    assert.deepEqual(E.render(q).channels, E.render(p).channels, name);
  }
});

test('WAV export decodes back to the rendered samples, mono and stereo', () => {
  const p = EXAMPLES['Siren']();
  const r = E.render(p);
  for (const bits of [8, 16]) {
    const d = decodeWav(encodeWav(r.channels, r.sampleRate, bits));
    assert.equal(d.sampleRate, r.sampleRate);
    const tol = bits === 8 ? 1 / 64 : 1 / 16384;
    for (let i = 0; i < r.channels[0].length; i += 97) assert.ok(close(d.channels[0][i], r.channels[0][i], tol));
  }
  E.getRecorder(p).props.stereo = true;
  const st = E.render(p);
  assert.equal(decodeWav(encodeWav(st.channels, st.sampleRate, 16)).channels.length, 2);
});

test('ffmpeg decodes exported WAV and FLAC to identical samples', { skip: FFMPEG ? false : 'ffmpeg is not installed' }, () => {
  const r = E.render(EXAMPLES['Whoosh']());
  const wav = ffmpegDecode(encodeWav(r.channels, r.sampleRate, 16), 'wav');
  const flac = ffmpegDecode(encodeFlac(r.channels, r.sampleRate, 16), 'flac');
  assert.equal(wav.length, r.channels[0].length);
  assert.equal(flac.length, wav.length);
  let mismatches = 0;
  for (let i = 0; i < wav.length; i++) if (flac[i] !== wav[i]) mismatches++;
  assert.equal(mismatches, 0);
});

test('ffmpeg decodes stereo and 8-bit FLAC', { skip: FFMPEG ? false : 'ffmpeg is not installed' }, () => {
  const p = EXAMPLES['Simple tone']();
  Object.assign(E.getRecorder(p).props, { stereo: true, bits: 8, duration: 0.3 });
  const r = E.render(p);
  const flac = ffmpegDecode(encodeFlac(r.channels, r.sampleRate, 8), 'flac');
  assert.equal(flac.length, r.channels[0].length * 2); // interleaved stereo
  const wav = ffmpegDecode(encodeWav(r.channels, r.sampleRate, 8), 'wav');
  assert.equal(wav.length, flac.length);
});
