/*
 * Minimal FLAC encoder: mono, 8- or 16-bit, VERBATIM subframes.
 * The output is a valid, lossless FLAC file, but it isn't compressed; every frame
 * stores its samples as-is. No libraries needed, so it works offline.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackFlac = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var BLOCK_SIZE = 4096;

  function crc8(bytes, from, to) {
    var crc = 0;
    for (var i = from; i < to; i++) {
      crc ^= bytes[i];
      for (var b = 0; b < 8; b++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
    return crc;
  }

  function crc16(bytes, from, to) {
    var crc = 0;
    for (var i = from; i < to; i++) {
      crc ^= bytes[i] << 8;
      for (var b = 0; b < 8; b++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x8005) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  }

  /** FLAC's UTF-8-style coding of the frame number. */
  function utf8Number(n) {
    if (n < 0x80) return [n];
    if (n < 0x800) return [0xc0 | (n >> 6), 0x80 | (n & 0x3f)];
    if (n < 0x10000) return [0xe0 | (n >> 12), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
    return [0xf0 | (n >> 18), 0x80 | ((n >> 12) & 0x3f), 0x80 | ((n >> 6) & 0x3f), 0x80 | (n & 0x3f)];
  }

  function toInt(s, bits) {
    s = Math.min(1, Math.max(-1, s));
    var max = bits === 8 ? 127 : 32767;
    return s < 0 ? Math.round(s * (max + 1)) : Math.round(s * max);
  }

  /** Encodes mono float samples (±1) as a FLAC file. bits is 8 or 16. */
  function encodeFlac(samples, sampleRate, bits) {
    bits = bits === 8 ? 8 : 16;
    var bytesPer = bits / 8;
    var total = samples.length;
    var frames = Math.ceil(total / BLOCK_SIZE);
    var out = [];

    // "fLaC" + STREAMINFO (the last metadata block, 34 bytes).
    out.push(0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34);
    out.push(BLOCK_SIZE >> 8, BLOCK_SIZE & 0xff, BLOCK_SIZE >> 8, BLOCK_SIZE & 0xff);
    out.push(0, 0, 0, 0, 0, 0); // min/max frame size: unknown
    var hi = Math.floor(total / 4294967296) & 0xf;
    out.push(
      (sampleRate >> 12) & 0xff,
      (sampleRate >> 4) & 0xff,
      ((sampleRate & 0xf) << 4) | (0 << 1) | ((bits - 1) >> 4),
      (((bits - 1) & 0xf) << 4) | hi,
      (total >>> 24) & 0xff, (total >>> 16) & 0xff, (total >>> 8) & 0xff, total & 0xff
    );
    for (var m = 0; m < 16; m++) out.push(0); // MD5: not computed

    for (var f = 0; f < frames; f++) {
      var start = f * BLOCK_SIZE;
      var size = Math.min(BLOCK_SIZE, total - start);
      var frame = [
        0xff, 0xf8, // sync code, fixed block size
        0x70, // block size: 16-bit (size-1) at end of header; sample rate: from STREAMINFO
        (0 << 4) | ((bits === 8 ? 1 : 4) << 1) // mono; 8 or 16 bits per sample
      ];
      frame = frame.concat(utf8Number(f));
      frame.push((size - 1) >> 8, (size - 1) & 0xff);
      frame.push(crc8(frame, 0, frame.length));
      frame.push(0x02); // VERBATIM subframe, no wasted bits
      for (var i = 0; i < size; i++) {
        var v = toInt(samples[start + i], bits);
        if (bytesPer === 2) frame.push((v >> 8) & 0xff, v & 0xff);
        else frame.push(v & 0xff);
      }
      var crc = crc16(frame, 0, frame.length);
      frame.push(crc >> 8, crc & 0xff);
      for (var j = 0; j < frame.length; j++) out.push(frame[j]);
    }
    return new Uint8Array(out);
  }

  return { encodeFlac: encodeFlac, crc8: crc8, crc16: crc16, BLOCK_SIZE: BLOCK_SIZE };
});
