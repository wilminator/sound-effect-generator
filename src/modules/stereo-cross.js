/* Stereo Cross: L = SL·LL + SR·RL, R = SL·LR + SR·RR. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Stereo to Stereo Cross', {
    group: 'Stereo',
    help: 'Cross-mixes the channels of a stereo signal with a 2x2 matrix (swap, collapse, balance).',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0, stereo: true },
      { key: 'leftToLeft', label: 'Left to Left', default: 1 },
      { key: 'leftToRight', label: 'Left to Right', default: 0 },
      { key: 'rightToLeft', label: 'Right to Left', default: 0 },
      { key: 'rightToRight', label: 'Right to Right', default: 1 }
    ],
    stereoOutput: true,
    render: function (ctx) {
      var s = ctx.inputStereo('signal');
      var ll = ctx.input('leftToLeft');
      var lr = ctx.input('leftToRight');
      var rl = ctx.input('rightToLeft');
      var rr = ctx.input('rightToRight');
      var outL = new Float32Array(ctx.n);
      var outR = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        outL[i] = s.left[i] * ll[i] + s.right[i] * rl[i];
        outR[i] = s.left[i] * lr[i] + s.right[i] * rr[i];
      }
      return { left: outL, right: outR };
    }
  });
});
