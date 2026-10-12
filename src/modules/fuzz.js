/*
 * Fuzz: a hard clipper between Lower and Upper. Symmetrical clips at ±|Upper|.
 * Force to zero subtracts Lower after clipping, so the output starts at 0.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Fuzz', {
    group: 'Filters',
    help: 'Clips the signal for a distorted sound.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'upper', label: 'Upper', default: 0.5 },
      { key: 'lower', label: 'Lower', default: -0.5 }
    ],
    props: [
      { key: 'forceZero', label: 'Force to zero', type: 'bool', default: false },
      { key: 'symmetrical', label: 'Symmetrical', type: 'bool', default: false }
    ],
    render: function (ctx) {
      var s = ctx.input('signal');
      var up = ctx.input('upper');
      var lo = ctx.input('lower');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        var u = up[i];
        var l = ctx.props.symmetrical ? -Math.abs(u) : lo[i];
        if (ctx.props.symmetrical) u = Math.abs(u);
        var v = Math.min(u, Math.max(l, s[i]));
        out[i] = ctx.props.forceZero ? v - l : v;
      }
      return out;
    }
  });
});
