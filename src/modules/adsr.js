/* ADSR envelope; sustain stretches to fill the requested duration, and A/D/R shrink if they don't fit. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function envelope(props, n, sampleRate) {
    var a = Math.max(0, props.attack) * sampleRate;
    var d = Math.max(0, props.decay) * sampleRate;
    var r = Math.max(0, props.release) * sampleRate;
    if (a + d + r > n && a + d + r > 0) {
      var k = n / (a + d + r);
      a *= k; d *= k; r *= k;
    }
    var relStart = n - r;
    var env = new Float32Array(n);
    function seg(from, to, u) { return from + (to - from) * E.curve(props.curve, props.degree, u); }
    for (var i = 0; i < n; i++) {
      if (i < a) env[i] = seg(0, props.peak, i / a);
      else if (i < a + d) env[i] = seg(props.peak, props.sustain, (i - a) / d);
      else if (i < relStart) env[i] = props.sustain;
      else env[i] = seg(props.sustain, 0, r > 0 ? (i - relStart) / r : 1);
    }
    return env;
  }

  E.register('ADSR', {
    group: 'Envelopes',
    help: 'Attack, decay, sustain and release. Sustain fills whatever length is asked for.',
    inputs: [{ key: 'signal', label: 'Signal', default: 1 }],
    props: [
      E.num('attack', 'Attack time (s)', 0.02, { min: 0 }),
      E.num('peak', 'Attack peak', 1),
      E.num('decay', 'Decay time (s)', 0.1, { min: 0 }),
      E.num('sustain', 'Sustain level', 0.7),
      E.num('release', 'Release time (s)', 0.2, { min: 0 }),
      { key: 'curve', label: 'Curve type', type: 'select', options: E.CURVES, default: 'Linear' },
      E.num('degree', 'Curve degree', 3)
    ],
    envelope: envelope,
    render: function (ctx) {
      var env = envelope(ctx.props, ctx.n, ctx.sampleRate);
      var s = ctx.input('signal');
      for (var i = 0; i < ctx.n; i++) env[i] *= s[i];
      return env;
    }
  });
});
