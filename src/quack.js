/*
 * Quack synthesis core. No DOM or Web Audio dependencies, so it runs in the
 * browser (as window.Quack) and in Node (via require) for tests.
 *
 * A quack is modelled as a buzzy glottal source (saw + pulse) passed through
 * two moving formant filters. The formants open quickly and close slowly,
 * which gives the "qu-ACK" shape; the pitch rises then drops at the same time.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.Quack = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var PARAM_SPECS = [
    { key: 'pitch', label: 'Pitch', unit: 'Hz', min: 100, max: 1500, step: 1, default: 420 },
    { key: 'duration', label: 'Duration', unit: 's', min: 0.05, max: 1, step: 0.01, default: 0.28 },
    { key: 'nasal', label: 'Nasal', unit: '', min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: 'buzz', label: 'Buzz', unit: '', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'wobble', label: 'Wobble', unit: '', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'count', label: 'Quacks', unit: '', min: 1, max: 5, step: 1, default: 1 },
    { key: 'volume', label: 'Volume', unit: '', min: 0, max: 1, step: 0.01, default: 0.8 }
  ];

  var PRESETS = {
    'Mallard': { pitch: 380, duration: 0.28, nasal: 0.7, buzz: 0.55, wobble: 0.35, count: 1, volume: 0.8 },
    'Rubber duck': { pitch: 850, duration: 0.22, nasal: 0.25, buzz: 0.15, wobble: 0.05, count: 1, volume: 0.8 },
    'Duckling': { pitch: 1200, duration: 0.12, nasal: 0.5, buzz: 0.3, wobble: 0.2, count: 3, volume: 0.7 },
    'Angry goose': { pitch: 260, duration: 0.5, nasal: 0.85, buzz: 0.9, wobble: 0.7, count: 2, volume: 0.9 }
  };

  var GAP_SECONDS = 0.08;

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  /** Returns a complete, in-range parameter set; missing or bad values use defaults. */
  function clampParams(params) {
    params = params || {};
    var out = {};
    PARAM_SPECS.forEach(function (spec) {
      var v = Number(params[spec.key]);
      if (!isFinite(v)) v = spec.default;
      v = clamp(v, spec.min, spec.max);
      if (spec.step === 1) v = Math.round(v);
      out[spec.key] = v;
    });
    return out;
  }

  /** Random parameters within each spec's range. rng defaults to Math.random. */
  function randomParams(rng) {
    rng = rng || Math.random;
    var out = {};
    PARAM_SPECS.forEach(function (spec) {
      out[spec.key] = spec.min + rng() * (spec.max - spec.min);
    });
    out.volume = 0.8;
    out.count = rng() < 0.6 ? 1 : out.count;
    return clampParams(out);
  }

  /** Small seeded PRNG so renders are reproducible. */
  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** RBJ band-pass biquad (constant 0 dB peak gain). */
  function makeBandpass() {
    var b0 = 0, b2 = 0, a1 = 0, a2 = 0;
    var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return {
      set: function (freq, q, sampleRate) {
        var w0 = 2 * Math.PI * clamp(freq, 20, sampleRate * 0.45) / sampleRate;
        var alpha = Math.sin(w0) / (2 * q);
        var a0 = 1 + alpha;
        b0 = alpha / a0;
        b2 = -alpha / a0;
        a1 = (-2 * Math.cos(w0)) / a0;
        a2 = (1 - alpha) / a0;
      },
      process: function (x) {
        var y = b0 * x + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        return y;
      }
    };
  }

  function totalSamples(p, sampleRate) {
    var one = Math.round(p.duration * sampleRate);
    var gap = Math.round(GAP_SECONDS * sampleRate);
    return p.count * one + (p.count - 1) * gap;
  }

  /** Renders one quack into out[offset .. offset + n). */
  function renderOne(out, offset, n, p, sampleRate, rng) {
    var f1 = makeBandpass();
    var f2 = makeBandpass();
    var q = 1.5 + p.nasal * 8;
    var sizeScale = Math.pow(p.pitch / 400, 0.3);
    var pw = 0.5 - 0.42 * p.buzz;
    var noiseAmt = 0.03 + 0.12 * p.buzz;
    var attack = Math.min(0.012 * sampleRate, n * 0.3);
    var releaseStart = n * 0.65;
    var phase = 0;

    for (var i = 0; i < n; i++) {
      var t = i / sampleRate;
      var u = i / n;

      // Formant trajectory: open fast, close slowly. Update every 32 samples.
      if ((i & 31) === 0) {
        var open = u < 0.25 ? u / 0.25 : 1 - 0.6 * (u - 0.25) / 0.75;
        f1.set((500 + 700 * open) * sizeScale, q, sampleRate);
        f2.set((1600 + 1200 * open) * sizeScale, q, sampleRate);
      }

      var pitchEnv = u < 0.2 ? 0.85 + 0.25 * (u / 0.2) : 1.1 - 0.35 * (u - 0.2) / 0.8;
      var vibrato = 1 + 0.06 * p.wobble * Math.sin(2 * Math.PI * 7 * t);
      var freq = p.pitch * pitchEnv * vibrato;

      phase += freq / sampleRate;
      phase -= Math.floor(phase);
      var saw = 2 * phase - 1;
      var pulse = (phase < pw ? 1 : -1) - (2 * pw - 1);
      var src = 0.5 * saw + 0.5 * pulse + noiseAmt * (rng() * 2 - 1);

      var wet = f1.process(src) + 0.6 * f2.process(src);
      var s = (1 - p.nasal) * src + p.nasal * wet * 3;

      var env;
      if (i < attack) env = i / attack;
      else if (i > releaseStart) env = Math.pow(1 - (i - releaseStart) / (n - releaseStart), 2);
      else env = 1;
      // Rattle: fast amplitude modulation that makes a quack sound rough.
      env *= 1 - 0.3 * p.wobble * (0.5 + 0.5 * Math.sin(2 * Math.PI * 35 * t));

      out[offset + i] = s * env;
    }
  }

  /**
   * Renders the quack(s) to a mono Float32Array at sampleRate.
   * Peak level equals params.volume. options.seed makes noise reproducible.
   */
  function render(params, sampleRate, options) {
    var p = clampParams(params);
    sampleRate = sampleRate || 44100;
    var rng = mulberry32((options && options.seed) || 1);
    var out = new Float32Array(totalSamples(p, sampleRate));
    var one = Math.round(p.duration * sampleRate);
    var gap = Math.round(GAP_SECONDS * sampleRate);

    for (var k = 0; k < p.count; k++) {
      renderOne(out, k * (one + gap), one, p, sampleRate, rng);
    }

    // DC blocker, then normalize to the requested peak.
    var prevX = 0, prevY = 0, r = 1 - (2 * Math.PI * 40) / sampleRate, peak = 0;
    for (var i = 0; i < out.length; i++) {
      var y = out[i] - prevX + r * prevY;
      prevX = out[i];
      prevY = y;
      out[i] = y;
      if (Math.abs(y) > peak) peak = Math.abs(y);
    }
    if (peak > 0) {
      var gain = p.volume / peak;
      for (var j = 0; j < out.length; j++) out[j] *= gain;
    }
    return out;
  }

  /** Encodes mono float samples as a 16-bit PCM WAV file. */
  function encodeWav(samples, sampleRate) {
    var dataSize = samples.length * 2;
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
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    str(36, 'data');
    view.setUint32(40, dataSize, true);
    for (var i = 0; i < samples.length; i++) {
      var s = clamp(samples[i], -1, 1);
      view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  return {
    PARAM_SPECS: PARAM_SPECS,
    PRESETS: PRESETS,
    GAP_SECONDS: GAP_SECONDS,
    clampParams: clampParams,
    randomParams: randomParams,
    render: render,
    encodeWav: encodeWav
  };
});
