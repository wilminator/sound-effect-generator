/*
 * Sample and Hold. Each time Trigger crosses from positive to negative, Signal is latched
 * and held until the next trigger.
 * Choices the help leaves open: a crossing is previous trigger >= 0 and current trigger < 0
 * (so a trigger that touches exactly 0 on the way down still fires once); the first sample
 * has no predecessor and never triggers; Signal is read at the crossing sample itself;
 * before the first trigger the output is 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Sample and Hold', {
    group: 'Mixers',
    help: 'Snapshots Signal whenever Trigger falls from positive to negative, and holds it.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'trigger', label: 'Trigger', default: 0 }
    ],
    render: function (ctx) {
      var sig = ctx.input('signal');
      var trig = ctx.input('trigger');
      var out = new Float32Array(ctx.n);
      var held = 0;
      for (var i = 0; i < ctx.n; i++) {
        if (i > 0 && trig[i - 1] >= 0 && trig[i] < 0) held = sig[i];
        out[i] = held;
      }
      return out;
    }
  });
});
