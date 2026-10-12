/* Sine wave source: Offset + Volume·sin(2πp). Starts at 0. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Sine', {
    group: 'Sources',
    help: 'A pure tone. Feed another wave into Freq for vibrato or Phase for phase distortion.',
    inputs: E.OSC_INPUTS,
    render: function (ctx) {
      return E.oscillator(ctx, { fn: function (p) { return Math.sin(2 * Math.PI * p); } });
    }
  });
});
