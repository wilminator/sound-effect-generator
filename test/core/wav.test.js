const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeWav, decodeWav } = require('../../src/core/wav.js');

test('encodeWav writes a valid 16-bit mono header and clips samples', () => {
  const wav = encodeWav([new Float32Array([0, 1, -1, 2])], 22050, 16);
  const v = new DataView(wav.buffer);
  const ascii = (o, n) => String.fromCharCode(...wav.slice(o, o + n));
  assert.equal(ascii(0, 4), 'RIFF');
  assert.equal(ascii(8, 4), 'WAVE');
  assert.equal(v.getUint16(22, true), 1);
  assert.equal(v.getUint32(24, true), 22050);
  assert.equal(v.getUint16(34, true), 16);
  assert.equal(v.getUint32(40, true), 8);
  assert.equal(v.getInt16(46, true), 32767);
  assert.equal(v.getInt16(48, true), -32768);
  assert.equal(v.getInt16(50, true), 32767);
});

test('encodeWav writes unsigned 8-bit samples', () => {
  const wav = encodeWav([new Float32Array([-1, 0, 1])], 8000, 8);
  const v = new DataView(wav.buffer);
  assert.equal(wav.length, 44 + 3);
  assert.equal(v.getUint16(34, true), 8);
  assert.deepEqual([...wav.slice(44)], [0, 128, 255]);
});

test('stereo WAV interleaves channels and decodes back', () => {
  const left = new Float32Array([0.5, -0.5, 0.25]);
  const right = new Float32Array([-0.25, 0, 1]);
  const wav = encodeWav([left, right], 44100, 16);
  const v = new DataView(wav.buffer);
  assert.equal(v.getUint16(22, true), 2);
  assert.equal(v.getUint16(32, true), 4);
  assert.equal(v.getUint32(28, true), 44100 * 4);
  const d = decodeWav(wav);
  assert.equal(d.sampleRate, 44100);
  assert.equal(d.channels.length, 2);
  for (let i = 0; i < 3; i++) {
    assert.ok(Math.abs(d.channels[0][i] - left[i]) < 1e-4);
    assert.ok(Math.abs(d.channels[1][i] - right[i]) < 1e-4);
  }
});

test('decodeWav reads 8-bit, 24-bit and float files and skips unknown chunks', () => {
  function build(format, bits, samples, extraChunk) {
    const bps = bits / 8;
    const extra = extraChunk ? 8 + 3 + 1 : 0; // odd-sized chunk plus pad byte
    const buf = new ArrayBuffer(44 + extra + samples.length * bps);
    const v = new DataView(buf);
    const str = (o, s) => [...s].forEach((ch, i) => v.setUint8(o + i, ch.charCodeAt(0)));
    str(0, 'RIFF'); v.setUint32(4, buf.byteLength - 8, true); str(8, 'WAVE');
    str(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, format, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000 * bps, true); v.setUint16(32, bps, true); v.setUint16(34, bits, true);
    let o = 36;
    if (extraChunk) { str(o, 'LIST'); v.setUint32(o + 4, 3, true); o += 12; }
    str(o, 'data'); v.setUint32(o + 4, samples.length * bps, true); o += 8;
    samples.forEach((s) => {
      if (format === 3) v.setFloat32(o, s, true);
      else if (bits === 8) v.setUint8(o, s);
      else if (bits === 24) { v.setUint8(o, s & 255); v.setUint8(o + 1, (s >> 8) & 255); v.setUint8(o + 2, (s >> 16) & 255); }
      o += bps;
    });
    return new Uint8Array(buf);
  }
  assert.deepEqual([...decodeWav(build(1, 8, [0, 128, 255])).channels[0]], [-1, 0, 127 / 128]);
  const d24 = decodeWav(build(1, 24, [0x400000, 0xc00000], true)).channels[0];
  assert.ok(Math.abs(d24[0] - 0.5) < 1e-6 && Math.abs(d24[1] + 0.5) < 1e-6);
  const f = decodeWav(build(3, 32, [0.125, -2])).channels[0];
  assert.deepEqual([...f], [0.125, -2]);
});

test('decodeWav rejects files that are not uncompressed WAV', () => {
  assert.throws(() => decodeWav(new Uint8Array([1, 2, 3])), /Not a WAV/);
  const wav = encodeWav([new Float32Array(4)], 8000, 16);
  new DataView(wav.buffer).setUint16(20, 2, true); // ADPCM
  assert.throws(() => decodeWav(wav), /uncompressed/);
});
