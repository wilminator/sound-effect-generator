/* Math Function: Output(t) = f(t, x, a, b, c, d) for a user expression; x = t / duration. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'), require('../core/expr.js'));
  else factory(root.QuackEngine, root.QuackExpr);
})(typeof self !== 'undefined' ? self : this, function (E, X) {
  'use strict';

  var VARS = 'txabcd';

  E.register('Math Function', {
    group: 'Sources',
    help: 'Calculates an expression of time t, x (t / duration) and inputs a-d, e.g. a^b.',
    inputs: [
      { key: 'a', label: 'A', default: 0 },
      { key: 'b', label: 'B', default: 0 },
      { key: 'c', label: 'C', default: 0 },
      { key: 'd', label: 'D', default: 0 }
    ],
    props: [
      { key: 'expr', label: 'Expression', type: 'text', default: 'sin(2*pi*440*t)' }
    ],
    validate: function (c) {
      return X.check(c.props.expr, VARS);
    },
    render: function (ctx) {
      var fn = X.compile(ctx.props.expr, VARS);
      var a = ctx.input('a'), b = ctx.input('b'), c = ctx.input('c'), d = ctx.input('d');
      var out = new Float32Array(ctx.n);
      var vars = { t: 0, x: 0, a: 0, b: 0, c: 0, d: 0 }; // reused for every sample
      var dt = 1 / ctx.sampleRate;
      var dur = ctx.duration;
      for (var i = 0; i < ctx.n; i++) {
        var t = i * dt;
        vars.t = t;
        vars.x = dur > 0 ? t / dur : 0;
        vars.a = a[i]; vars.b = b[i]; vars.c = c[i]; vars.d = d[i];
        try {
          out[i] = fn(vars);
        } catch (e) {
          throw new Error('Math Function: ' + e.message + ' at t = ' + t + ' s');
        }
      }
      return out;
    }
  });
});
