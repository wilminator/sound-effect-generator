/* White noise. Each Noise carries its own seed, so a saved patch always renders the same sound. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Noise', {
    group: 'Sources',
    help: 'Random hiss. Change Seed for a different but repeatable noise.',
    inputs: [
      { key: 'volume', label: 'Volume', default: 1 },
      { key: 'offset', label: 'Offset', default: 0 }
    ],
    props: [E.num('seed', 'Seed', 1, { min: 0, max: 4294967295, step: 1 })],
    init: function (c) {
      c.props.seed = Math.floor(Math.random() * 4294967296);
    },
    render: function (ctx) {
      var rng = E.mulberry32(ctx.props.seed);
      var volume = ctx.input('volume');
      var offset = ctx.input('offset');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = offset[i] + volume[i] * (rng() * 2 - 1);
      return out;
    }
  });
});
