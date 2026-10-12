/* Wave Function: Offset + Volume·f(p, t, x, a, b, c, d); p is the normalised oscillator phase. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'), require('../core/expr.js'));
  else factory(root.QuackEngine, root.QuackExpr);
})(typeof self !== 'undefined' ? self : this, function (E, X) {
  'use strict';

  var VARS = 'ptxabcd';

  E.register('Wave Function', {
    group: 'Sources',
    help: 'An oscillator whose shape is an expression of phase p, time t, x (t / duration) and inputs a-d.',
    inputs: E.OSC_INPUTS.concat([
      { key: 'a', label: 'A', default: 0 },
      { key: 'b', label: 'B', default: 0 },
      { key: 'c', label: 'C', default: 0 },
      { key: 'd', label: 'D', default: 0 }
    ]),
    props: [
      { key: 'expr', label: 'Expression', type: 'text', default: 'sin(2*pi*p)' }
    ],
    validate: function (c) {
      return X.check(c.props.expr, VARS);
    },
    render: function (ctx) {
      var fn = X.compile(ctx.props.expr, VARS);
      var a = ctx.input('a'), b = ctx.input('b'), c = ctx.input('c'), d = ctx.input('d');
      var vars = { p: 0, t: 0, x: 0, a: 0, b: 0, c: 0, d: 0 }; // reused for every sample
      var dt = 1 / ctx.sampleRate;
      var dur = ctx.duration;
      return E.oscillator(ctx, {
        fn: function (p, unused, i) {
          var t = i * dt;
          vars.p = p;
          vars.t = t;
          vars.x = dur > 0 ? t / dur : 0;
          vars.a = a[i]; vars.b = b[i]; vars.c = c[i]; vars.d = d[i];
          try {
            return fn(vars);
          } catch (e) {
            throw new Error('Wave Function: ' + e.message + ' at t = ' + t + ' s');
          }
        }
      });
    }
  });
});
