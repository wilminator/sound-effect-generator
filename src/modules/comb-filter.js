/* Comb Filter: S(t) + Strength·S(t − 1/Frequency). Frequency is at least 1 Hz. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Comb Filter', {
    group: 'Filters',
    help: 'Adds a delayed copy of the signal, giving a pitched, hollow tone. Sweep Frequency for a whoosh.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'freq', label: 'Frequency', default: 100 },
      { key: 'strength', label: 'Strength', default: 0.5 }
    ],
    render: function (ctx) {
      var s = ctx.input('signal');
      var f = ctx.input('freq');
      var str = ctx.input('strength');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        var delay = ctx.sampleRate / Math.max(1, f[i]);
        out[i] = s[i] + str[i] * E.sampleAt(s, i - delay);
      }
      return out;
    }
  });
});
