/* Stereo to Mono Merger: out = SL·Left + SR·Right. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  // The spec gives no defaults for Left/Right; 0.5 each makes an unconfigured
  // merger the average of the channels, matching how the engine mixes stereo to mono.
  E.register('Stereo to Mono Merger', {
    group: 'Stereo',
    help: 'Mixes the left and right channels of a stereo signal into mono with independent amounts.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0, stereo: true },
      { key: 'left', label: 'Left', default: 0.5 },
      { key: 'right', label: 'Right', default: 0.5 }
    ],
    render: function (ctx) {
      var s = ctx.inputStereo('signal');
      var l = ctx.input('left');
      var r = ctx.input('right');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = s.left[i] * l[i] + s.right[i] * r[i];
      return out;
    }
  });
});
