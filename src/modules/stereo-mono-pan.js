/* Stereo to Mono Pan: out = SL·(1−Pan) + SR·Pan. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Stereo to Mono Pan', {
    group: 'Stereo',
    help: 'Mixes a stereo signal to mono: Pan 0 is the left channel, Pan 1 the right.',
    inputs: [
      { key: 'signal', label: 'Signal', default: 0, stereo: true },
      { key: 'pan', label: 'Pan', default: 0.5 }
    ],
    render: function (ctx) {
      var s = ctx.inputStereo('signal');
      var pan = ctx.input('pan');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = s.left[i] * (1 - pan[i]) + s.right[i] * pan[i];
      return out;
    }
  });
});
