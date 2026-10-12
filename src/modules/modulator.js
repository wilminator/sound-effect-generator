/* Modulator: Sig A × Sig B (ring modulation, or a gain when B is unconnected). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Modulator', {
    group: 'Mixers',
    help: 'Multiplies two signals. Use it to shape one signal with another.',
    inputs: [
      { key: 'sigA', label: 'Sig A', default: 1 },
      { key: 'sigB', label: 'Sig B', default: 1 }
    ],
    render: function (ctx) {
      var a = ctx.input('sigA');
      var b = ctx.input('sigB');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = a[i] * b[i];
      return out;
    }
  });
});
