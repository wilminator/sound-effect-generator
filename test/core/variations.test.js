const test = require('node:test');
const assert = require('node:assert/strict');
const { E } = require('../helpers.js');
const { vary } = require('../../src/core/variations.js');
const { zip, crc32 } = require('../../src/core/zip.js');

function patchWithSine() {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 400, volume: 1, phase: 0 });
  const sweep = E.addComponent(p, 'Sweep');
  Object.assign(sweep.props, { from: 200, to: 600 });
  E.connect(p, sweep.id, sine.id, 'freq');
  E.connect(p, sine.id, E.getRecorder(p).id, 'signal');
  const noise = E.addComponent(p, 'Noise');
  return { p, sine, sweep, noise };
}

test('vary nudges typed-in numbers within the amount and keeps the patch intact', () => {
  const { p, sine, sweep, noise } = patchWithSine();
  const v = vary(p, { amount: 0.1, seed: 7 });
  const get = (id) => E.getComponent(v, id);
  assert.equal(v.connections.length, p.connections.length);
  assert.equal(get(sine.id).inputs.freq, 400, 'connected inputs are not changed');
  assert.equal(get(sine.id).inputs.phase, 0, 'zero stays zero');
  assert.notEqual(get(sine.id).inputs.volume, 1);
  assert.ok(Math.abs(get(sine.id).inputs.volume - 1) <= 0.1 + 1e-9);
  for (const k of ['from', 'to']) {
    const r = get(sweep.id).props[k] / sweep.props[k];
    assert.ok(r >= 0.9 - 1e-9 && r <= 1.1 + 1e-9 && r !== 1, k);
  }
  assert.notEqual(get(noise.id).props.seed, noise.props.seed);
  assert.deepEqual(E.getRecorder(v).props, E.getRecorder(p).props, 'the Recorder is left alone');
  assert.equal(sine.inputs.volume, 1, 'the original patch is unchanged');
});

test('vary is repeatable with a seed, and amount 0 changes nothing but seeds', () => {
  const { p, noise } = patchWithSine();
  assert.deepEqual(vary(p, { seed: 3 }), vary(p, { seed: 3 }));
  const same = vary(p, { amount: 0, seed: 1 });
  E.getComponent(same, noise.id).props.seed = noise.props.seed;
  assert.equal(E.serialize(same), E.serialize(p));
});

test('vary keeps values inside their limits', () => {
  const p = E.createPatch();
  const adsr = E.addComponent(p, 'ADSR');
  Object.assign(adsr.props, { attack: 0.0001 });
  for (let seed = 0; seed < 50; seed++) {
    const v = vary(p, { amount: 3, seed });
    assert.ok(E.getComponent(v, adsr.id).props.attack >= 0);
  }
});

test('zip stores files that a standard reader can find', () => {
  assert.equal(crc32(Buffer.from('hello')), 0x3610a686);
  const z = Buffer.from(zip([{ name: 'a.wav', data: new Uint8Array([1, 2, 3]) }, { name: 'b.wav', data: new Uint8Array(0) }]));
  assert.equal(z.readUInt32LE(0), 0x04034b50);
  const end = z.length - 22;
  assert.equal(z.readUInt32LE(end), 0x06054b50);
  assert.equal(z.readUInt16LE(end + 10), 2);
  const dir = z.readUInt32LE(end + 16);
  assert.equal(z.readUInt32LE(dir), 0x02014b50);
  assert.equal(z.toString('latin1', dir + 46, dir + 51), 'a.wav');
  assert.deepEqual([...z.subarray(35, 38)], [1, 2, 3]);
});
