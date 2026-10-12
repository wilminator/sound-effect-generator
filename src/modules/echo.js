/*
 * Echo: S(t) + Strength·S(t − Delay(t)), with Delay capped at Max Delay. Repeating echoes
 * feed back the output instead. A changing Delay gives a Doppler-like pitch shift.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Echo', {
    group: 'Filters',
    help: 'A single or repeating echo.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'delay', label: 'Delay (s)', default: 0.25 },
      { key: 'strength', label: 'Strength', default: 0.5 }
    ],
    props: [
      { key: 'multiple', label: 'Repeating echoes', type: 'bool', default: false },
      E.num('maxDelay', 'Max delay (s)', 1, { min: 0 })
    ],
    render: function (ctx) {
      var s = ctx.input('signal');
      var d = ctx.input('delay');
      var str = ctx.input('strength');
      var multiple = ctx.props.multiple;
      var out = new Float32Array(ctx.n);
      var src = multiple ? out : s;
      for (var i = 0; i < ctx.n; i++) {
        var delay = Math.min(Math.max(d[i], 0), ctx.props.maxDelay) * ctx.sampleRate;
        // A repeating echo feeds back its own output, so it needs at least one sample of delay.
        if (multiple) delay = Math.max(delay, 1);
        out[i] = s[i] + str[i] * E.sampleAt(src, i - delay);
      }
      return out;
    }
  });
});
