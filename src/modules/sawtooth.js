/* Sawtooth/triangle source. R/F sets where the rise ends: 1 is a ramp up, 0.5 a triangle. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Sawtooth', {
    group: 'Sources',
    help: 'A rising and falling wave. R/F is the share of each cycle spent rising.',
    inputs: E.OSC_INPUTS.concat([{ key: 'rf', label: 'R/F', default: 0.5 }]),
    render: function (ctx) {
      return E.oscillator(ctx, {
        input: 'rf',
        fn: function (x, rf) {
          rf = E.clamp(rf, 0, 1);
          if (rf <= 0) return 2 * (1 - x) - 1;
          if (rf >= 1) return 2 * x - 1;
          return x < rf ? (2 * x) / rf - 1 : (2 * (1 - x)) / (1 - rf) - 1;
        }
      });
    }
  });
});
