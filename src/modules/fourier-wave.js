/* Fourier wave source: Offset + Volume·Σ amp[n]·sin(2π(order[n]·p + phase[n])). */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  var MAX_ORDER = 4095;
  var TWO_PI = 2 * Math.PI;

  // The help text writes sin(2π(x + phase[n])) and leaves the order implicit; here the
  // harmonic order is the multiplier on the normalised phase p: sin(2π(order·p + phase)).
  function wave(rows, p) {
    var s = 0;
    for (var k = 0; k < rows.length; k++) {
      s += rows[k].amp * Math.sin(TWO_PI * (rows[k].order * p + rows[k].phase));
    }
    return s;
  }

  function n0(x) { x = Number(x); return isFinite(x) ? x : 0; }

  function cleanRows(rows) {
    return (rows || []).map(function (r) {
      return { order: n0(r.order), amp: n0(r.amp), phase: n0(r.phase) };
    });
  }

  // Peak of |wave| over one cycle. Sampling at 16 points per cycle of the highest order
  // (at least 4096) then refining around the best sample.
  function peakOf(rows) {
    var maxOrder = 1;
    rows.forEach(function (r) { if (r.order > maxOrder) maxOrder = r.order; });
    var N = Math.max(4096, 16 * maxOrder);
    var best = 0, bi = 0;
    for (var i = 0; i < N; i++) {
      var v = Math.abs(wave(rows, i / N));
      if (v > best) { best = v; bi = i; }
    }
    var lo = (bi - 1) / N, hi = (bi + 1) / N;
    for (var it = 0; it < 40; it++) {
      var m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (Math.abs(wave(rows, m1)) < Math.abs(wave(rows, m2))) lo = m1; else hi = m2;
    }
    return Math.max(best, Math.abs(wave(rows, (lo + hi) / 2)));
  }

  function validate(c) {
    var rows = c.props.harmonics;
    if (!Array.isArray(rows)) return 'Harmonics must be a list';
    if (rows.length > MAX_ORDER) return 'At most ' + MAX_ORDER + ' harmonics are allowed';
    for (var i = 0; i < rows.length; i++) {
      var o = rows[i].order;
      if (typeof o !== 'number' || !isFinite(o) || Math.floor(o) !== o || o < 1 || o > MAX_ORDER) {
        return 'Harmonic ' + (i + 1) + ': order must be a whole number from 1 to ' + MAX_ORDER;
      }
    }
    return null;
  }

  function normalise(c) {
    var rows = cleanRows(c.props.harmonics);
    var pk = rows.length ? peakOf(rows) : 0;
    if (!(pk > 0)) return;
    c.props.harmonics.forEach(function (r) { r.amp = r.amp / pk; });
  }

  // Adds harmonics a/n^b for n = first, first+step, ... <= last, with phase 0.
  // The help does not say what happens to an existing harmonic of the same order:
  // it is replaced; other existing harmonics are kept.
  function addSeries(c, v) {
    var a = Number(v.a), b = Number(v.b), first = Number(v.first), last = Number(v.last), step = Number(v.step);
    if (![a, b, first, last, step].every(isFinite)) throw new Error('Add series: all values must be numbers');
    if (step < 1 || Math.floor(step) !== step) throw new Error('Add series: step must be a whole number of at least 1');
    if (first < 1 || last > MAX_ORDER || Math.floor(first) !== first || Math.floor(last) !== last) {
      throw new Error('Add series: first and last must be whole numbers from 1 to ' + MAX_ORDER);
    }
    var rows = c.props.harmonics;
    for (var n = first; n <= last; n += step) {
      var row = { order: n, amp: a / Math.pow(n, b), phase: 0 };
      var at = -1;
      for (var k = 0; k < rows.length; k++) if (rows[k].order === n) { at = k; break; }
      if (at >= 0) rows[at] = row; else rows.push(row);
    }
  }

  // One harmonic per line: "order amp phase", whitespace separated. Replaces the table.
  function importText(c, text) {
    var rows = [];
    var lines = String(text).split(/\r\n|\r|\n/);
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim();
      if (!line) continue;
      var f = line.split(/\s+/);
      var nums = f.map(Number);
      var bad = f.length !== 3 || nums.some(function (x, k) { return f[k] === '' || !isFinite(x); });
      if (bad) throw new Error('Import: line ' + (i + 1) + ' is not "order amplitude phase": ' + lines[i].trim());
      if (nums[0] < 1 || nums[0] > MAX_ORDER || Math.floor(nums[0]) !== nums[0]) {
        throw new Error('Import: line ' + (i + 1) + ': order must be a whole number from 1 to ' + MAX_ORDER);
      }
      if (nums[2] < 0 || nums[2] > 1) throw new Error('Import: line ' + (i + 1) + ': phase must be between 0 and 1');
      rows.push({ order: nums[0], amp: nums[1], phase: nums[2] });
    }
    if (rows.length > MAX_ORDER) throw new Error('Import: at most ' + MAX_ORDER + ' harmonics are allowed');
    c.props.harmonics = rows;
  }

  E.register('Fourier Wave', {
    group: 'Sources',
    help: 'A waveform built from your own list of harmonics, each with an order, amplitude and phase.',
    inputs: E.OSC_INPUTS,
    props: [{
      key: 'harmonics', label: 'Harmonics', type: 'table',
      columns: [
        { key: 'order', label: 'Order', type: 'number', default: 1 },
        { key: 'amp', label: 'Amplitude', type: 'number', default: 1 },
        { key: 'phase', label: 'Phase (0..1)', type: 'number', default: 0 }
      ],
      default: [{ order: 1, amp: 1, phase: 0 }]
    }],
    validate: validate,
    actions: [
      { label: 'Normalise', run: normalise },
      {
        label: 'Add series',
        fields: [
          { key: 'a', label: 'Amplitude a', default: 1 },
          { key: 'b', label: 'Exponent b', default: 1 },
          { key: 'first', label: 'First harmonic', default: 1 },
          { key: 'last', label: 'Last harmonic', default: 15 },
          { key: 'step', label: 'Step', default: 2 }
        ],
        run: function (c, o) { addSeries(c, o.values || {}); }
      },
      { label: 'Import', file: 'text', run: function (c, o) { importText(c, o.text); } }
    ],
    wave: wave,
    render: function (ctx) {
      var rows = cleanRows(ctx.props.harmonics);
      return E.oscillator(ctx, { fn: function (p) { return wave(rows, p); } });
    }
  });
});
