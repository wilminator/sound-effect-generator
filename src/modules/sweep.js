/* Sweep: Signal · (From + (To − From)·t/Duration), over the requested duration. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Sweep', {
    group: 'Envelopes',
    help: 'A straight-line ramp from From to To over the sound, times Signal.',
    inputs: [{ key: 'signal', label: 'Signal', default: 1 }],
    props: [E.num('from', 'From', 0), E.num('to', 'To', 1)],
    render: function (ctx) {
      var s = ctx.input('signal');
      var from = ctx.props.from;
      var to = ctx.props.to;
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = s[i] * (from + (to - from) * (i / ctx.n));
      return out;
    }
  });
});
