/* Merger: a crossfader, A·BA + B·(1 − BA). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Merger', {
    group: 'Mixers',
    help: 'Crossfades between two signals. B/A = 1 is all A, 0 is all B.',
    inputs: [
      { key: 'sigA', label: 'Sig A', default: 0 },
      { key: 'sigB', label: 'Sig B', default: 0 },
      { key: 'ba', label: 'B/A', default: 0.5 }
    ],
    render: function (ctx) {
      var a = ctx.input('sigA');
      var b = ctx.input('sigB');
      var ba = ctx.input('ba');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = a[i] * ba[i] + b[i] * (1 - ba[i]);
      return out;
    }
  });
});
