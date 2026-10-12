/*
 * Generic envelope: Signal · envelope(t), where the envelope is a list of sections played one
 * after another. Each section goes from start to end over its duration along a curve
 * (E.curve). With sameAsPrevious set, start is the previous section's end (the first section
 * always uses its own start).
 * The help does not say what happens when the sections don't match the sound length, so:
 * if they run out, the last end value is held; if they run past the end, they are cut off.
 * Sections of zero or negative duration are skipped. With no sections the envelope is 1.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function num(x) { x = Number(x); return isFinite(x) ? x : 0; }

  function envelope(sections, n, sampleRate) {
    var segs = [];
    var t = 0, prevEnd = null, i;
    (sections || []).forEach(function (s) {
      var start = (s.sameAsPrevious && prevEnd !== null) ? prevEnd : num(s.start);
      var end = num(s.end);
      var dur = Math.max(0, num(s.duration));
      prevEnd = end;
      if (dur <= 0) return;
      segs.push({ t0: t, t1: t + dur, start: start, end: end, curve: s.curve, degree: num(s.degree) });
      t += dur;
    });
    var env = new Float32Array(n);
    if (!segs.length) { env.fill(1); return env; }
    var last = segs[segs.length - 1].end;
    var k = 0;
    for (i = 0; i < n; i++) {
      var time = i / sampleRate;
      while (k < segs.length && time >= segs[k].t1) k++;
      if (k >= segs.length) { env[i] = last; continue; }
      var s = segs[k];
      var u = (time - s.t0) / (s.t1 - s.t0);
      env[i] = s.start + (s.end - s.start) * E.curve(s.curve, s.degree, u);
    }
    return env;
  }

  E.register('Envelope', {
    group: 'Envelopes',
    help: 'A general envelope made of any number of sections, each with start, end, duration and curve.',
    inputs: [{ key: 'signal', label: 'Signal', default: 1 }],
    props: [{
      key: 'sections', label: 'Sections', type: 'table',
      columns: [
        { key: 'start', label: 'Start value', type: 'number', default: 0 },
        { key: 'sameAsPrevious', label: 'Same as previous end', type: 'bool', default: false },
        { key: 'end', label: 'End value', type: 'number', default: 1 },
        { key: 'duration', label: 'Duration (s)', type: 'number', default: 0.1 },
        { key: 'curve', label: 'Curve type', type: 'select', options: E.CURVES, default: 'Linear' },
        { key: 'degree', label: 'Curve degree', type: 'number', default: 3 }
      ],
      default: [
        { start: 0, sameAsPrevious: false, end: 1, duration: 0.1, curve: 'Linear', degree: 3 },
        { start: 1, sameAsPrevious: true, end: 0, duration: 0.4, curve: 'Linear', degree: 3 }
      ]
    }],
    envelope: envelope,
    render: function (ctx) {
      var env = envelope(ctx.props.sections, ctx.n, ctx.sampleRate);
      var s = ctx.input('signal');
      for (var i = 0; i < ctx.n; i++) env[i] *= s[i];
      return env;
    }
  });
});
