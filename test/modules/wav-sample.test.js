const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');
require('../../src/modules/wav-sample.js');
const { encodeWav } = require('../../src/core/wav.js');

const file = (channels, rate, name = 'a.wav') => ({
  name,
  data: E.bytesToBase64(encodeWav(channels, rate, 16))
});
const f32 = (a) => Float32Array.from(a);
const near = (a, b, eps = 1e-3) => Math.abs(a - b) <= eps;
const render = (p, c, n = 10, sr = SR) => E.renderNode(p, c.id, n, sr);

test('mono file plays at the same rate, scaled by Volume, and pads with zeros', () => {
  const src = [0.5, -0.5, 0.25, 1];
  const { p, c } = single('WAV Sample', { volume: 2 }, { file: file([f32(src)], SR) });
  const out = render(p, c, 8);
  assert.ok(out instanceof Float32Array);
  src.forEach((v, i) => assert.ok(near(out[i], 2 * v), `sample ${i}`));
  for (let i = 4; i < 8; i++) assert.equal(out[i], 0);
});

test('stereo file gives a stereo output and mono gives a mono one', () => {
  const st = single('WAV Sample', {}, { file: file([f32([0.5, 0.5]), f32([-0.5, 0.25])], SR) });
  assert.equal(E.isStereoOutput(st.c), true);
  const out = render(st.p, st.c, 3);
  assert.ok(near(out.left[0], 0.5) && near(out.right[0], -0.5) && near(out.right[1], 0.25));
  assert.equal(out.left[2], 0);
  const mono = single('WAV Sample', {}, { file: file([f32([0.5])], SR) });
  assert.equal(E.isStereoOutput(mono.c), false);
  assert.ok(render(mono.p, mono.c, 2) instanceof Float32Array);
});

test('more than two channels: even channels average to left, odd to right', () => {
  const chs = [f32([0.8]), f32([0.2]), f32([0.4]), f32([0.6])];
  const { p, c } = single('WAV Sample', {}, { file: file(chs, SR) });
  const out = render(p, c, 1);
  assert.ok(near(out.left[0], 0.6) && near(out.right[0], 0.4));
});

test('upsampling 8000 -> 16000 interpolates linearly', () => {
  const { p, c } = single('WAV Sample', {}, { file: file([f32([0, 0.5, 1])], 8000) });
  const out = render(p, c, 8, 16000);
  [0, 0.25, 0.5, 0.75, 1, 0.5, 0, 0].forEach((v, i) => assert.ok(near(out[i], v), `sample ${i}: ${out[i]}`));
});

test('downsampling 16000 -> 8000 takes every other frame', () => {
  const { p, c } = single('WAV Sample', {}, { file: file([f32([0, 0.1, 0.2, 0.3, 0.4, 0.5])], 16000) });
  const out = render(p, c, 5, 8000);
  [0, 0.2, 0.4, 0, 0].forEach((v, i) => assert.ok(near(out[i], v), `sample ${i}`));
});

test('null file renders silence and validates', () => {
  const { p, c } = single('WAV Sample');
  assert.equal(c.props.file, null);
  assert.ok(render(p, c, 5).every((x) => x === 0));
  assert.deepEqual(E.validate(p), []);
});

test('bad files are reported by validate and render silence', () => {
  const bad = { name: 'x.wav', data: E.bytesToBase64(new Uint8Array([1, 2, 3, 4, 5])) };
  const { p, c } = single('WAV Sample', {}, { file: bad });
  const errs = E.validate(p);
  assert.equal(errs.length, 1);
  assert.match(errs[0].error, /x\.wav/);
  assert.ok(render(p, c, 5).every((x) => x === 0));
  c.props.file = { name: 'e.wav', data: file([new Float32Array(0)], SR).data };
  assert.equal(E.validate(p).length, 1);
  c.props.file = { name: 'n.wav', data: '' };
  assert.equal(E.validate(p).length, 1);
});

test('decoded audio is cached per file object', () => {
  const f = file([f32([0.5, 0.25])], SR);
  const { p, c } = single('WAV Sample', {}, { file: f });
  const a = render(p, c, 2);
  f.data = 'garbage'; // would fail if decoded again
  assert.deepEqual(render(p, c, 2), a);
  assert.deepEqual(E.validate(p), []);
  c.props.file = { name: f.name, data: 'garbage' }; // a new object is decoded afresh
  assert.equal(E.validate(p).length, 1);
});

test('end to end: WAV Sample -> Recorder', () => {
  const p = E.createPatch();
  const w = E.addComponent(p, 'WAV Sample');
  w.props.file = file([f32([0.5, 0.5, 0.5, 0.5])], 22050);
  const rec = E.getRecorder(p);
  rec.props.duration = 0.01;
  E.connect(p, w.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels.length, 1);
  assert.ok(near(r.channels[0][0], 0.5) && near(r.channels[0][3], 0.5));
  assert.equal(r.channels[0][10], 0);
  rec.props.stereo = true;
  assert.equal(E.render(p).channels.length, 2);
});
