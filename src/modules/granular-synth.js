/*
 * Granular synthesizer. Renders Signal for Source Duration into a buffer, then spawns grains from t = 0.
 * At each grain start (reading the inputs at that time) Volume, Duration, Pos and Gap are drawn
 * uniformly from value ± range. A grain plays the buffer from Pos seconds for Duration seconds, scaled
 * by Volume and the envelope, and is summed into the output. The next grain starts Gap seconds later.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // Upper bound on total grain samples mixed per render. Extremely dense clouds (tiny gaps, long grains)
  // would otherwise take minutes; once the budget is spent no further grains are spawned.
  var WORK_BUDGET = 150e6;

  /*
   * Grain envelope at u in [0, 1) through the grain.
   *  Trapezoidal: linear ramps of length min(control, 0.5) at each end (control 0 = rectangle, 0.5 = triangle).
   *  Gaussian: exp(-0.5 (k x)^2), x = 2u-1, k = 3 + 6 control, so control 0 is a bell that is ~0.01 at the
   *    edges and larger values pinch it. Negative control flattens the top instead, exp(-4.5 |x|^p) with
   *    p = 2 + 6 |control| (up to 60): a rounded-off trapezoid.
   *  Attack/Decay: rises over the first fraction control (clamped 0..1) of the grain and falls over the rest,
   *    both using the Curve Type/Degree (control 0 = pure decay from 1, 1 = pure attack).
   */
  function envelopeAt(shape, control, curveType, degree, u) {
    var c = control;
    if (shape === 'Gaussian') {
      var x = Math.abs(2 * u - 1);
      if (c >= 0) { var k = (3 + 6 * c) * x; return Math.exp(-0.5 * k * k); }
      return Math.exp(-4.5 * Math.pow(x, Math.min(60, 2 + 6 * -c)));
    }
    if (shape === 'Attack/Decay') {
      var a = E.clamp(c, 0, 1);
      if (u < a) return E.curve(curveType, degree, u / a);
      return 1 - E.curve(curveType, degree, a >= 1 ? 1 : (u - a) / (1 - a));
    }
    var r = E.clamp(c, 0, 0.5);
    if (r > 0 && u < r) return u / r;
    if (r > 0 && u > 1 - r) return (1 - u) / r;
    return 1;
  }

  function finite(x, def) {
    return typeof x === 'number' && isFinite(x) ? x : def;
  }

  E.register('Granular Synth', {
    group: 'Sources',
    help: 'Builds a sound from many short, overlapping grains of the Signal. Gap, Volume, Duration and Pos each have a random range (R).',
    inputs: [
      { key: 'signal', label: 'Signal', default: 1 },
      { key: 'gap', label: 'Gap', default: 0.001 },
      { key: 'gapR', label: 'GapR', default: 0 },
      { key: 'volume', label: 'Volume', default: 0.05 },
      { key: 'volumeR', label: 'VolumeR', default: 0 },
      { key: 'duration', label: 'Duration', default: 0.1 },
      { key: 'durationR', label: 'DurationR', default: 0 },
      { key: 'pos', label: 'Pos', default: 0 },
      { key: 'posR', label: 'PosR', default: 0 }
    ],
    props: [
      E.num('sourceDuration', 'Source Duration (s)', 1, { min: 0 }),
      { key: 'shape', label: 'Envelope Shape', type: 'select', options: ['Trapezoidal', 'Gaussian', 'Attack/Decay'], default: 'Trapezoidal' },
      E.num('control', 'Envelope Control', 0.5),
      { key: 'curve', label: 'Curve Type', type: 'select', options: E.CURVES, default: 'Linear' },
      E.num('degree', 'Curve Degree', 3),
      E.num('seed', 'Seed', 1, { min: 0, max: 4294967295, step: 1 })
    ],
    init: function (c) {
      c.props.seed = Math.floor(Math.random() * 4294967296);
    },
    envelopeAt: envelopeAt,
    render: function (ctx) {
      var n = ctx.n;
      var sr = ctx.sampleRate;
      var p = ctx.props;
      var out = new Float32Array(n);
      var srcLen = Math.max(0, Math.round(finite(p.sourceDuration, 1) * sr));
      var gap = ctx.input('gap');
      var gapR = ctx.input('gapR');
      var vol = ctx.input('volume');
      var volR = ctx.input('volumeR');
      var dur = ctx.input('duration');
      var durR = ctx.input('durationR');
      var pos = ctx.input('pos');
      var posR = ctx.input('posR');
      var src = ctx.input('signal', srcLen);
      if (n === 0 || srcLen === 0) return out;
      var rng = E.mulberry32(p.seed);
      var control = finite(p.control, 0.5);
      var degree = finite(p.degree, 3);
      var budget = WORK_BUDGET;
      var t = 0; // grain start in samples (fractional so small gaps accumulate correctly)

      while (t < n && budget > 0) {
        var s = Math.round(t); // rounded: inputs are Float32, so 0.01 s * 8000 is 79.99999...
        if (s >= n) break;
        // Draw all four values every grain so the random sequence does not depend on the ranges.
        var v = finite(vol[s], 0) + finite(volR[s], 0) * (rng() * 2 - 1);
        var d = finite(dur[s], 0) + finite(durR[s], 0) * (rng() * 2 - 1);
        var ps = finite(pos[s], 0) + finite(posR[s], 0) * (rng() * 2 - 1);
        var g = finite(gap[s], 0) + finite(gapR[s], 0) * (rng() * 2 - 1);
        var len = Math.max(1, Math.round(d * sr));
        var from = Math.max(0, Math.round(ps * sr));
        var end = Math.min(len, n - s, srcLen - from); // beyond the stored signal is silence
        if (end > budget) end = budget;
        for (var j = 0; j < end; j++) {
          out[s + j] += v * src[from + j] * envelopeAt(p.shape, control, p.curve, degree, j / len);
        }
        budget -= Math.max(end, 1);
        t += Math.max(1, g * sr); // never less than one sample, so the loop always advances
      }
      return out;
    }
  });
});
