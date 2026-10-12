/* Mono to Stereo Pan: L = S·(1−Pan), R = S·Pan (linear, as in the original help). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Mono to Stereo Pan', {
    group: 'Stereo',
    help: 'Pans a mono signal between left (Pan 0) and right (Pan 1).',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0 },
      { key: 'pan', label: 'Pan', default: 0.5 }
    ],
    stereoOutput: true,
    render: function (ctx) {
      var s = ctx.input('signal');
      var pan = ctx.input('pan');
      var outL = new Float32Array(ctx.n);
      var outR = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        outL[i] = s[i] * (1 - pan[i]);
        outR[i] = s[i] * pan[i];
      }
      return { left: outL, right: outR };
    }
  });
});
