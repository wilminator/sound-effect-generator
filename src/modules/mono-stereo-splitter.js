/* Mono to Stereo Splitter: L = S·Left, R = S·Right. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Mono to Stereo Splitter', {
    group: 'Stereo',
    help: 'Splits a mono signal into left and right channels with independent volumes.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'left', label: 'Left', default: 1 },
      { key: 'right', label: 'Right', default: 1 }
    ],
    stereoOutput: true,
    render: function (ctx) {
      var s = ctx.input('signal');
      var l = ctx.input('left');
      var r = ctx.input('right');
      var outL = new Float32Array(ctx.n);
      var outR = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        outL[i] = s[i] * l[i];
        outR[i] = s[i] * r[i];
      }
      return { left: outL, right: outR };
    }
  });
});
