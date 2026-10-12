/* Music Modulator: a note's frequency, shifted by Signal semitones. Octave 5 holds middle C. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

  E.register('Music Modulator', {
    group: 'Mixers',
    help: 'Turns semitones into a frequency for an oscillator\'s Freq input. A in octave 5 is 440 Hz.',
    inputs: [{ key: 'signal', label: 'Signal (semitones)', default: 0 }],
    props: [
      { key: 'note', label: 'Note', type: 'select', options: NOTES, default: 'A' },
      E.num('octave', 'Octave', 5, { min: 0, max: 10, step: 1 })
    ],
    render: function (ctx) {
      var idx = NOTES.indexOf(ctx.props.note);
      var base = 440 * Math.pow(2, (idx - 9) / 12 + (ctx.props.octave - 5));
      var s = ctx.input('signal');
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) out[i] = base * Math.pow(2, s[i] / 12);
      return out;
    }
  });
});
