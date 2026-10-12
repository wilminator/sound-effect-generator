/*
 * WAV Sample source: plays an uncompressed WAV file, scaled by Volume.
 * Unlike the original Quack (which stored only a filename), the file's bytes are embedded
 * in the patch as base64 ({ name, data }), so saved patches stay portable.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../core/engine.js'), require('../core/wav.js'));
  } else {
    factory(root.QuackEngine, root.QuackWav);
  }
})(typeof self !== 'undefined' ? self : this, function (E, Wav) {
  'use strict';

  // Decoded files, cached per file value object: { rate, channels } or { error }.
  var cache = typeof WeakMap === 'function' ? new WeakMap() : null;

  function decode(file) {
    if (!file || typeof file !== 'object') return null;
    var hit = cache && cache.get(file);
    if (hit) return hit;
    var result;
    try {
      var w = Wav.decodeWav(E.base64ToBytes(file.data));
      if (!w.channels.length || !w.channels[0].length || !(w.sampleRate > 0)) throw new Error('The WAV file is empty');
      result = { rate: w.sampleRate, channels: mixdown(w.channels) };
    } catch (e) {
      result = { error: 'Cannot read ' + (file.name || 'the WAV file') + ': ' + (e && e.message ? e.message : e) };
    }
    if (cache) cache.set(file, result);
    return result;
  }

  /*
   * Mono stays mono, stereo stays stereo. For more than 2 channels the choice is ours:
   * even-numbered channels (1st, 3rd, ...) are averaged into left and odd-numbered ones into right.
   */
  function mixdown(chs) {
    if (chs.length <= 2) return chs;
    var len = chs[0].length;
    var l = new Float32Array(len);
    var r = new Float32Array(len);
    var nl = 0;
    var nr = 0;
    chs.forEach(function (ch, k) {
      var dst = k % 2 === 0 ? l : r;
      if (k % 2 === 0) nl++; else nr++;
      for (var i = 0; i < len; i++) dst[i] += ch[i];
    });
    for (var i = 0; i < len; i++) { l[i] /= nl; r[i] /= nr; }
    return [l, r];
  }

  // Output sample i is the file at time i/sampleRate; linear interpolation between the two nearest
  // source frames, and zeros once the file has run out.
  function resample(src, rate, n, sampleRate, volume) {
    var out = new Float32Array(n);
    var step = rate / sampleRate;
    var len = src.length;
    for (var i = 0; i < n; i++) {
      var pos = i * step;
      var k = Math.floor(pos);
      if (k >= len) break;
      var f = pos - k;
      var a = src[k];
      var b = k + 1 < len ? src[k + 1] : 0;
      out[i] = (a + (b - a) * f) * volume[i];
    }
    return out;
  }

  E.register('WAV Sample', {
    group: 'Sources',
    help: 'Plays a WAV file (embedded in the patch). Resamples to the project rate and pads with silence.',
    inputs: [{ key: 'volume', label: 'Volume', default: 1 }],
    props: [{ key: 'file', label: 'File', type: 'file', accept: '.wav,audio/wav', default: null }],
    stereoOutput: function (c) {
      var d = decode(c.props.file);
      return !!d && !d.error && d.channels.length >= 2;
    },
    validate: function (c) {
      var d = decode(c.props.file);
      return d && d.error ? d.error : null;
    },
    render: function (ctx) {
      var volume = ctx.input('volume');
      var d = decode(ctx.props.file);
      if (!d || d.error) return new Float32Array(ctx.n);
      var l = resample(d.channels[0], d.rate, ctx.n, ctx.sampleRate, volume);
      if (d.channels.length < 2) return l;
      return { left: l, right: resample(d.channels[1], d.rate, ctx.n, ctx.sampleRate, volume) };
    }
  });
});
