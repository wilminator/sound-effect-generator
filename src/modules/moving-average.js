/*
 * Moving Average (top hat) filter over a window of Width seconds.
 * Low-pass: (1 − Strength)·S + Strength·avg. High-pass: S − Strength·avg.
 * The original calls the width input "Frequency" but describes it as a width in seconds.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Moving Average', {
    group: 'Filters',
    help: 'Smooths (low-pass) or thins (high-pass) the signal by averaging over a short window.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'strength', label: 'Strength', default: 1 },
      { key: 'width', label: 'Width (s)', default: 0.001 }
    ],
    props: [{ key: 'mode', label: 'Type', type: 'select', options: ['Low-pass', 'High-pass'], default: 'Low-pass' }],
    render: function (ctx) {
      var s = ctx.input('signal');
      var str = ctx.input('strength');
      var w = ctx.input('width');
      var prefix = new Float64Array(ctx.n + 1);
      for (var i = 0; i < ctx.n; i++) prefix[i + 1] = prefix[i] + s[i];
      var out = new Float32Array(ctx.n);
      var hp = ctx.props.mode === 'High-pass';
      for (var j = 0; j < ctx.n; j++) {
        var width = Math.max(1, Math.round(w[j] * ctx.sampleRate));
        var from = Math.max(0, j + 1 - width);
        var avg = (prefix[j + 1] - prefix[from]) / (j + 1 - from);
        out[j] = hp ? s[j] - str[j] * avg : (1 - str[j]) * s[j] + str[j] * avg;
      }
      return out;
    }
  });
});
