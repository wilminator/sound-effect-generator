/*
 * Variations: copies of a patch with small random changes, for sets of similar sounds
 * (five footsteps that aren't all the same).
 * - Each number typed into an unconnected input, and each number property, moves by up to
 *   ±amount of its value (0.05 = ±5%). Zero stays zero, and min/max limits are kept.
 * - Seed properties (Noise, Granular Synth) get a new random seed.
 * - The Recorder, whole-number properties (step 1), tables and embedded patches are left alone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.QuackVariations = factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  /** Returns a varied copy of patch. `seed` makes the result repeatable. */
  function vary(patch, options) {
    options = options || {};
    var amount = Math.max(0, Number(options.amount === undefined ? 0.05 : options.amount));
    var rand = E.mulberry32(options.seed === undefined ? (Math.random() * 4294967296) >>> 0 : options.seed >>> 0);
    var out = E.parse(E.serialize(patch));
    function jitter(v, spec) {
      if (typeof v !== 'number' || !isFinite(v) || v === 0 || amount === 0) return v;
      var x = v * (1 + amount * (2 * rand() - 1));
      if (spec && spec.min !== undefined) x = Math.max(spec.min, x);
      if (spec && spec.max !== undefined) x = Math.min(spec.max, x);
      return Number(x.toPrecision(6));
    }
    out.components.forEach(function (c) {
      if (c.type === 'Recorder') return;
      E.inputsOf(c).forEach(function (spec) {
        if (!E.sourceOf(out, c.id, spec.key)) c.inputs[spec.key] = jitter(c.inputs[spec.key], spec);
      });
      E.TYPES[c.type].props.forEach(function (spec) {
        if (spec.key === 'seed') c.props.seed = Math.floor(rand() * 4294967296);
        else if (spec.type === 'number' && spec.step !== 1) c.props[spec.key] = jitter(c.props[spec.key], spec);
      });
    });
    return out;
  }

  return { vary: vary };
});
