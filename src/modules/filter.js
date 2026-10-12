/*
 * Resonant filter (a biquad, from Robert Bristow-Johnson's Audio EQ Cookbook).
 * Cutoff and Resonance are inputs, so they can be swept or modulated while the sound plays.
 * Not in the original Quack, which only had the comb and moving-average filters.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var TYPES = ['Low-pass', 'High-pass', 'Band-pass', 'Notch'];

  E.register('Filter', {
    group: 'Filters',
    help: 'Keeps the lows, highs or a band around Cutoff (Hz). Higher Resonance makes a sharper, ringing peak.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'cutoff', label: 'Cutoff (Hz)', default: 1000 },
      { key: 'resonance', label: 'Resonance', default: 0.707 }
    ],
    props: [{ key: 'mode', label: 'Type', type: 'select', options: TYPES, default: 'Low-pass' }],
    render: function (ctx) {
      var s = ctx.input('signal');
      var fc = ctx.input('cutoff');
      var res = ctx.input('resonance');
      var mode = TYPES.indexOf(ctx.props.mode);
      var sr = ctx.sampleRate;
      var out = new Float32Array(ctx.n);
      var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      var lastF = NaN, lastQ = NaN;
      var b0, b1, b2, a1, a2;
      for (var i = 0; i < ctx.n; i++) {
        var f = E.clamp(fc[i], 1, sr * 0.49);
        var q = Math.max(0.05, res[i]);
        if (f !== lastF || q !== lastQ) {
          lastF = f;
          lastQ = q;
          var w = 2 * Math.PI * f / sr;
          var cos = Math.cos(w);
          var alpha = Math.sin(w) / (2 * q);
          var a0 = 1 + alpha;
          if (mode === 1) { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0; }
          else if (mode === 2) { b0 = alpha; b1 = 0; b2 = -alpha; }
          else if (mode === 3) { b0 = 1; b1 = -2 * cos; b2 = 1; }
          else { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0; }
          b0 /= a0; b1 /= a0; b2 /= a0;
          a1 = -2 * cos / a0;
          a2 = (1 - alpha) / a0;
        }
        var x = s[i];
        var y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1; x1 = x;
        y2 = y1; y1 = y;
        out[i] = y;
      }
      return out;
    }
  });
});
