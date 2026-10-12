const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, peak, impulse } = require('../helpers.js');
for (const m of ['mono-stereo-splitter', 'mono-stereo-pan', 'stereo-mono-merger', 'stereo-mono-pan', 'stereo-cross']) {
  require(`../../src/modules/${m}.js`);
}
require('../../src/modules/echo.js');

function build(stereo, ...chain) {
  // chain: [type, inputs] items wired in order onto 'signal'; first is fed by a 100 Hz Sine.
  const p = E.createPatch();
  let prev = E.addComponent(p, 'Sine');
  prev.inputs.freq = 100;
  for (const [type, inputs] of chain) {
    const c = E.addComponent(p, type);
    Object.assign(c.inputs, inputs || {});
    E.connect(p, prev.id, c.id, 'signal');
    prev = c;
  }
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { stereo, duration: 0.1, sampleRate: SR });
  E.connect(p, prev.id, rec.id, 'signal');
  return p;
}

test('mono sine panned hard left: right channel is silent', () => {
  const r = E.render(build(true, ['Mono to Stereo Pan', { pan: 0 }]));
  assert.equal(r.channels.length, 2);
  assert.ok(peak(r.channels[0]) > 0.9);
  assert.equal(peak(r.channels[1]), 0);
});

test('splitter then cross swaps the channels', () => {
  const a = E.render(build(true, ['Mono to Stereo Splitter', { left: 1, right: 0.25 }]));
  const b = E.render(build(true,
    ['Mono to Stereo Splitter', { left: 1, right: 0.25 }],
    ['Stereo to Stereo Cross', { leftToLeft: 0, leftToRight: 1, rightToLeft: 1, rightToRight: 0 }]));
  for (let i = 0; i < a.channels[0].length; i++) {
    assert.ok(close(b.channels[0][i], a.channels[1][i]));
    assert.ok(close(b.channels[1][i], a.channels[0][i]));
  }
});

test('stereo to mono merger brings it back to mono', () => {
  const mono = E.render(build(false));
  const back = E.render(build(false,
    ['Mono to Stereo Splitter', { left: 0.6, right: 0.4 }],
    ['Stereo to Mono Merger', { left: 1, right: 1 }]));
  assert.equal(back.channels.length, 1);
  for (let i = 0; i < mono.channels[0].length; i++) assert.ok(close(back.channels[0][i], mono.channels[0][i], 1e-5));
});

test('stereo source into a mono component (Echo) is averaged', () => {
  const p = E.createPatch();
  const seq = impulse(p, 1);
  const sp = E.addComponent(p, 'Mono to Stereo Splitter');
  Object.assign(sp.inputs, { left: 1, right: 0.5 });
  E.connect(p, seq.id, sp.id, 'signal');
  const echo = E.addComponent(p, 'Echo');
  Object.assign(echo.inputs, { delay: 0.01, strength: 1 });
  E.connect(p, sp.id, echo.id, 'signal');
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.1, sampleRate: SR });
  E.connect(p, echo.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels.length, 1);
  assert.ok(close(r.channels[0][0], 0.75));
  assert.ok(close(r.channels[0][80], 0.75));
});

test('mono Recorder fed a stereo signal gets the average', () => {
  const r = E.render(build(false, ['Mono to Stereo Splitter', { left: 1, right: 0 }]));
  const ref = E.render(build(false));
  assert.equal(r.channels.length, 1);
  for (let i = 0; i < ref.channels[0].length; i++) assert.ok(close(r.channels[0][i], ref.channels[0][i] / 2, 1e-5));
});

test('stereo Recorder with a mono chain renders identical channels', () => {
  const r = E.render(build(true));
  assert.deepEqual(Array.from(r.channels[0]), Array.from(r.channels[1]));
});

test('Stereo to Mono Pan after a Pan recovers the signal scaled by the pan law', () => {
  const r = E.render(build(false, ['Mono to Stereo Pan', { pan: 0.25 }], ['Stereo to Mono Pan', { pan: 0.25 }]));
  const ref = E.render(build(false));
  // 0.75·0.75 + 0.25·0.25 = 0.625
  assert.ok(close(r.channels[0][20], ref.channels[0][20] * 0.625, 1e-5));
});
