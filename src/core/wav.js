/*
 * WAV encoding and decoding: PCM, 8/16/24/32-bit integer and 32-bit float, any channel count.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackWav = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function clip(s) {
    return s > 1 ? 1 : s < -1 ? -1 : s;
  }

  /** Encodes channels (an array of Float32Arrays, ±1) as an 8- or 16-bit PCM WAV file. */
  function encodeWav(channels, sampleRate, bits) {
    if (channels instanceof Float32Array) channels = [channels];
    bits = bits === 8 ? 8 : 16;
    var nch = channels.length;
    var frames = channels[0].length;
    var bytes = bits / 8;
    var dataSize = frames * nch * bytes;
    var buf = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buf);
    function str(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, nch, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * nch * bytes, true);
    view.setUint16(32, nch * bytes, true);
    view.setUint16(34, bits, true);
    str(36, 'data');
    view.setUint32(40, dataSize, true);
    var off = 44;
    for (var i = 0; i < frames; i++) {
      for (var c = 0; c < nch; c++) {
        var s = clip(channels[c][i]);
        if (bits === 8) view.setUint8(off, Math.round((s + 1) * 127.5));
        else view.setInt16(off, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
        off += bytes;
      }
    }
    return new Uint8Array(buf);
  }

  /**
   * Decodes an uncompressed WAV file (PCM 8/16/24/32-bit or IEEE float 32/64-bit).
   * Returns { sampleRate, bits, channels: [Float32Array, ...] }.
   */
  function decodeWav(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
    var view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    function str(off, len) {
      var s = '';
      for (var i = 0; i < len; i++) s += String.fromCharCode(bytes[off + i]);
      return s;
    }
    if (bytes.length < 12 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE') throw new Error('Not a WAV file');
    var off = 12;
    var fmt = null;
    var data = null;
    while (off + 8 <= bytes.length) {
      var id = str(off, 4);
      var size = view.getUint32(off + 4, true);
      var body = off + 8;
      if (id === 'fmt ') {
        fmt = {
          format: view.getUint16(body, true),
          channels: view.getUint16(body + 2, true),
          sampleRate: view.getUint32(body + 4, true),
          blockAlign: view.getUint16(body + 12, true),
          bits: view.getUint16(body + 14, true)
        };
        if (fmt.format === 0xfffe && size >= 26) fmt.format = view.getUint16(body + 24, true); // WAVE_FORMAT_EXTENSIBLE
      } else if (id === 'data') {
        data = { offset: body, size: Math.min(size, bytes.length - body) };
      }
      off = body + size + (size & 1);
    }
    if (!fmt || !data) throw new Error('The WAV file has no format or data chunk');
    if (fmt.format !== 1 && fmt.format !== 3) throw new Error('Only uncompressed WAV files are supported');
    var nch = fmt.channels;
    var bps = fmt.bits / 8;
    var frames = Math.floor(data.size / (nch * bps));
    var channels = [];
    for (var c = 0; c < nch; c++) channels.push(new Float32Array(frames));
    var p = data.offset;
    for (var i = 0; i < frames; i++) {
      for (var ch = 0; ch < nch; ch++) {
        var v;
        if (fmt.format === 3) v = bps === 8 ? view.getFloat64(p, true) : view.getFloat32(p, true);
        else if (bps === 1) v = (bytes[p] - 128) / 128;
        else if (bps === 2) v = view.getInt16(p, true) / 32768;
        else if (bps === 3) v = (((bytes[p + 2] << 24) | (bytes[p + 1] << 16) | (bytes[p] << 8)) >> 8) / 8388608;
        else v = view.getInt32(p, true) / 2147483648;
        channels[ch][i] = v;
        p += bps;
      }
    }
    return { sampleRate: fmt.sampleRate, bits: fmt.bits, channels: channels };
  }

  return { encodeWav: encodeWav, decodeWav: decodeWav };
});
