/*
 * Sequencer: each input is requested for (End − Start) seconds and placed at Start.
 * With Repeat it loops until the end of the sound. Slots can overlap; they add.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var L = ['A', 'B', 'C', 'D'];

  E.register('Sequencer', {
    group: 'Mixers',
    help: 'Places up to four signals in time, once or repeating.',
    inputs: L.map(function (l) { return { key: 'sig' + l, label: 'Signal ' + l, default: 0 }; }),
    props: [].concat.apply([], L.map(function (l, idx) {
      return [
        E.num('start' + l, l + ' start (s)', 0, { min: 0 }),
        E.num('end' + l, l + ' end (s)', idx === 0 ? 1 : 0, { min: 0 }),
        { key: 'repeat' + l, label: l + ' repeat', type: 'bool', default: false }
      ];
    })),
    render: function (ctx) {
      var out = new Float32Array(ctx.n);
      var sr = ctx.sampleRate;
      L.forEach(function (l) {
        var start = Math.round(ctx.props['start' + l] * sr);
        var len = Math.round((ctx.props['end' + l] - ctx.props['start' + l]) * sr);
        if (len <= 0 || start >= ctx.n) return;
        var seg = ctx.input('sig' + l, len);
        var at = start;
        do {
          for (var i = 0; i < len && at + i < ctx.n; i++) out[at + i] += seg[i];
          at += len;
        } while (ctx.props['repeat' + l] && at < ctx.n);
      });
      return out;
    }
  });
});
