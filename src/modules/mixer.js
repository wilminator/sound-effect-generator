/* Mixer: Sig A·Volume A + ... + Sig D·Volume D. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var L = ['A', 'B', 'C', 'D'];

  E.register('Mixer', {
    group: 'Mixers',
    help: 'Adds up to four signals, each with its own volume.',
    inputs: L.map(function (l) { return { key: 'sig' + l, label: 'Sig ' + l, default: 0 }; }),
    props: L.map(function (l) { return E.num('vol' + l, 'Volume ' + l, 1); }),
    render: function (ctx) {
      var out = new Float32Array(ctx.n);
      L.forEach(function (l) {
        if (!ctx.isConnected('sig' + l) && !ctx.component.inputs['sig' + l]) return;
        var s = ctx.input('sig' + l);
        var v = ctx.props['vol' + l];
        for (var i = 0; i < ctx.n; i++) out[i] += s[i] * v;
      });
      return out;
    }
  });
});
