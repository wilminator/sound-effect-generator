/*
 * Counter: adds Step on each positive edge of Trigger (from <= 0 to > 0). A trigger that
 * starts above 0 counts once at the start. A positive edge on Reset returns to Start.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Counter', {
    group: 'Mixers',
    help: 'Counts rising edges of Trigger, adding Step each time.',
    inputs: [
      { key: 'trigger', label: 'Trigger', default: 0 },
      { key: 'step', label: 'Step', default: 1 },
      { key: 'reset', label: 'Reset', default: 0 }
    ],
    props: [E.num('start', 'Start value', 0)],
    render: function (ctx) {
      var trig = ctx.input('trigger');
      var step = ctx.input('step');
      var reset = ctx.input('reset');
      var out = new Float32Array(ctx.n);
      var value = ctx.props.start;
      var prevT = 0;
      var prevR = 0;
      for (var i = 0; i < ctx.n; i++) {
        if (reset[i] > 0 && prevR <= 0) value = ctx.props.start;
        else if (trig[i] > 0 && prevT <= 0) value += step[i];
        prevT = trig[i];
        prevR = reset[i];
        out[i] = value;
      }
      return out;
    }
  });
});
