/*
 * Plays another saved patch as a source. The nested patch is stored inside this one,
 * renders at the outer patch's sample rate and length, and keeps its Recorder volume.
 * It is stereo when the nested patch's Recorder is.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function inner(c) {
    return c.props.patch ? E.nestedPatch(c.props.patch) : null;
  }

  E.register('Patch', {
    group: 'Sources',
    help: 'Another saved patch, used as a source. Load a patch file into it.',
    inputs: [{ key: 'volume', label: 'Volume', default: 1 }],
    props: [{ key: 'patch', label: 'Patch file', type: 'patch', default: null }],
    stereoOutput: function (c) {
      try {
        var p = inner(c);
        return !!(p && E.getRecorder(p).props.stereo);
      } catch (e) {
        return false;
      }
    },
    validate: function (c) {
      try {
        inner(c);
        return null;
      } catch (e) {
        return 'the stored patch is invalid: ' + e.message;
      }
    },
    render: function (ctx) {
      var p = inner(ctx.component);
      if (!p) return new Float32Array(ctx.n);
      if (ctx.depth >= E.MAX_NESTING) throw new Error('Patches are nested too deeply');
      var sig = E.renderNode(p, E.getRecorder(p).id, ctx.n, ctx.sampleRate, ctx.depth + 1);
      var vol = ctx.input('volume');
      function scale(s) {
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = s[i] * vol[i];
        return out;
      }
      return E.isStereo(sig) ? { left: scale(sig.left), right: scale(sig.right) } : scale(sig);
    }
  });
});
