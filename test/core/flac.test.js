const test = require('node:test');
const assert = require('node:assert/strict');
const { encodeFlac, crc8, crc16, BLOCK_SIZE } = require('../../src/core/flac.js');

const HEADER = 4 + 4 + 34; // "fLaC" + metadata block header + STREAMINFO

function frameLength(samples, bits, frameNumber) {
  const utf8 = frameNumber < 0x80 ? 1 : frameNumber < 0x800 ? 2 : 3;
  return 4 + utf8 + 2 + 1 + 1 + samples * (bits / 8) + 2;
}

test('CRCs match the FLAC check values', () => {
  const bytes = [...'123456789'].map((c) => c.charCodeAt(0));
  assert.equal(crc8(bytes, 0, bytes.length), 0xf4);
  assert.equal(crc16(bytes, 0, bytes.length), 0xfee8);
});

test('STREAMINFO records sample rate, bit depth and length', () => {
  const total = 10000;
  const flac = encodeFlac(new Float32Array(total), 22050, 16);
  const v = new DataView(flac.buffer);
  assert.equal(String.fromCharCode(...flac.slice(0, 4)), 'fLaC');
  assert.equal(flac[4], 0x80); // last metadata block, STREAMINFO
  assert.equal(v.getUint16(8), BLOCK_SIZE);
  const packed = v.getUint32(18);
  assert.equal(packed >>> 12, 22050);
  assert.equal((packed >>> 9) & 0x7, 0); // 1 channel
  assert.equal(((packed >>> 4) & 0x1f) + 1, 16);
  assert.equal(v.getUint32(22), total);
});

test('frames are sized and framed correctly', () => {
  const total = BLOCK_SIZE * 2 + 100;
  for (const bits of [8, 16]) {
    const flac = encodeFlac(new Float32Array(total).fill(0.25), 8000, bits);
    const expected = HEADER + frameLength(BLOCK_SIZE, bits, 0) + frameLength(BLOCK_SIZE, bits, 1) + frameLength(100, bits, 2);
    assert.equal(flac.length, expected, bits + '-bit length');

    let at = HEADER;
    for (const [n, size] of [[0, BLOCK_SIZE], [1, BLOCK_SIZE], [2, 100]]) {
      assert.equal(flac[at], 0xff);
      assert.equal(flac[at + 1], 0xf8);
      assert.equal(flac[at + 4], n); // frame number
      assert.equal(((flac[at + 5] << 8) | flac[at + 6]) + 1, size);
      assert.equal(flac[at + 7], crc8(flac, at, at + 7));
      const len = frameLength(size, bits, n);
      const crc = (flac[at + len - 2] << 8) | flac[at + len - 1];
      assert.equal(crc, crc16(flac, at, at + len - 2));
      at += len;
    }
  }
});

test('samples are stored big-endian, signed and clipped', () => {
  const flac = encodeFlac(new Float32Array([0, 1, -1, 2]), 8000, 16);
  const v = new DataView(flac.buffer);
  const first = HEADER + 4 + 1 + 2 + 1 + 1;
  assert.equal(v.getInt16(first), 0);
  assert.equal(v.getInt16(first + 2), 32767);
  assert.equal(v.getInt16(first + 4), -32768);
  assert.equal(v.getInt16(first + 6), 32767);

  const f8 = encodeFlac(new Float32Array([1, -1]), 8000, 8);
  const v8 = new DataView(f8.buffer);
  assert.equal(v8.getInt8(first), 127);
  assert.equal(v8.getInt8(first + 1), -128);
});

test('stereo FLAC stores two verbatim subframes per frame', () => {
  const left = new Float32Array(10).fill(0.5);
  const right = new Float32Array(10).fill(-0.5);
  const flac = encodeFlac([left, right], 8000, 16);
  const v = new DataView(flac.buffer);
  assert.equal((v.getUint32(18) >>> 9) & 0x7, 1); // 2 channels in STREAMINFO
  const at = HEADER;
  assert.equal(flac[at + 3] >> 4, 1); // channel assignment: 2 independent channels
  const first = at + 8;
  assert.equal(flac[first], 0x02);
  assert.equal(v.getInt16(first + 1), Math.round(0.5 * 32767));
  const second = first + 1 + 20;
  assert.equal(flac[second], 0x02);
  assert.equal(v.getInt16(second + 1), -16384);
  assert.equal(flac.length, HEADER + 4 + 1 + 2 + 1 + 2 * (1 + 20) + 2);
  assert.throws(() => encodeFlac([left, right, left], 8000, 16), /1 or 2 channels/);
});
