/* Square/pulse source. M/S is the share of each cycle spent high. Starts high. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Square', {
    group: 'Sources',
    help: 'A buzzy on/off wave. With Volume 0.5 and Offset 0.5 it makes a 0/1 gate.',
    inputs: E.OSC_INPUTS.concat([{ key: 'ms', label: 'M/S', default: 0.5 }]),
    render: function (ctx) {
      return E.oscillator(ctx, { input: 'ms', fn: function (x, ms) { return x < ms ? 1 : -1; } });
    }
  });
});
