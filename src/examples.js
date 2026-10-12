/*
 * Built-in example patches, mostly the techniques the original Quack help teaches.
 * They're built in code rather than loaded from files so they work from file://.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./quack.js'));
  } else {
    root.QuackExamples = factory(root.QuackEngine);
  }
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  function add(patch, type, x, y, inputs, props) {
    var c = E.addComponent(patch, type, x, y);
    Object.assign(c.inputs, inputs || {});
    Object.assign(c.props, props || {});
    return c;
  }

  function recorder(patch, props) {
    var rec = E.getRecorder(patch);
    Object.assign(rec.props, props || {});
    return rec;
  }

  var EXAMPLES = {
    'Simple tone': function () {
      var p = E.createPatch();
      var sine = add(p, 'Sine', 300, 120, { freq: 440, volume: 0.8 });
      E.connect(p, sine.id, recorder(p).id, 'signal');
      return p;
    },

    'Siren': function () {
      var p = E.createPatch();
      var lfo = add(p, 'Sawtooth', 40, 80, { freq: 2, offset: 600, volume: 500, rf: 0.1 });
      var sq = add(p, 'Square', 320, 120, { volume: 0.5 });
      E.connect(p, lfo.id, sq.id, 'freq');
      E.connect(p, sq.id, recorder(p, { duration: 3 }).id, 'signal');
      return p;
    },

    'Wood block': function () {
      var p = E.createPatch();
      var sine = add(p, 'Sine', 40, 40, { freq: 900 });
      var noise = add(p, 'Noise', 40, 260, { volume: 0.6 }, { seed: 1234 });
      var merger = add(p, 'Merger', 260, 120, { ba: 0.75 });
      var env = add(p, 'ADSR', 440, 120, {}, { attack: 0.002, decay: 0.08, sustain: 0, release: 0, curve: 'Fast Start', degree: 4 });
      E.connect(p, sine.id, merger.id, 'sigA');
      E.connect(p, noise.id, merger.id, 'sigB');
      E.connect(p, merger.id, env.id, 'signal');
      E.connect(p, env.id, recorder(p, { duration: 0.3 }).id, 'signal');
      return p;
    },

    'Tom-tom': function () {
      var p = E.createPatch();
      var sweep = add(p, 'Sweep', 40, 100, {}, { from: 200, to: 300 });
      var sine = add(p, 'Sine', 240, 100);
      var env = add(p, 'ADSR', 420, 100, {}, { attack: 0.005, decay: 0.45, sustain: 0, release: 0, curve: 'Fast Start', degree: 3 });
      E.connect(p, sweep.id, sine.id, 'freq');
      E.connect(p, sine.id, env.id, 'signal');
      E.connect(p, env.id, recorder(p, { duration: 0.5 }).id, 'signal');
      return p;
    },

    'Whoosh': function () {
      var p = E.createPatch();
      var noise = add(p, 'Noise', 40, 40, { volume: 0.5 }, { seed: 5678 });
      var sweep = add(p, 'Sweep', 40, 240, {}, { from: 100, to: 2000 });
      var comb = add(p, 'Comb Filter', 250, 120, { strength: 0.95 });
      var env = add(p, 'ADSR', 440, 120, {}, { attack: 0.8, decay: 0.2, sustain: 0.6, release: 0.8 });
      E.connect(p, noise.id, comb.id, 'signal');
      E.connect(p, sweep.id, comb.id, 'freq');
      E.connect(p, comb.id, env.id, 'signal');
      E.connect(p, env.id, recorder(p, { duration: 2 }).id, 'signal');
      return p;
    },

    'Musical sweep': function () {
      var p = E.createPatch();
      var sweep = add(p, 'Sweep', 40, 100, {}, { from: 0, to: 24 });
      var music = add(p, 'Music Modulator', 220, 100, {}, { note: 'C', octave: 5 });
      var sq = add(p, 'Square', 420, 100, { volume: 0.4 });
      E.connect(p, sweep.id, music.id, 'signal');
      E.connect(p, music.id, sq.id, 'freq');
      E.connect(p, sq.id, recorder(p, { duration: 2, volume: 2 }).id, 'signal');
      return p;
    },

    'Echoing beeps': function () {
      var p = E.createPatch();
      var sine = add(p, 'Sine', 40, 100, { freq: 660 });
      var env = add(p, 'ADSR', 200, 100, {}, { attack: 0.005, decay: 0.1, sustain: 0, release: 0 });
      var seq = add(p, 'Sequencer', 360, 60, {}, { startA: 0, endA: 0.5, repeatA: true });
      var echo = add(p, 'Echo', 540, 100, { delay: 0.18, strength: 0.5 }, { multiple: true });
      E.connect(p, sine.id, env.id, 'signal');
      E.connect(p, env.id, seq.id, 'sigA');
      E.connect(p, seq.id, echo.id, 'signal');
      E.connect(p, echo.id, recorder(p, { duration: 2, volume: 0.6 }).id, 'signal');
      return p;
    },

    'Arpeggio': function () {
      // A gate steps a Counter on each beat; the Counter picks the next note through a Switch.
      var p = E.createPatch();
      var gate = add(p, 'Square', 40, 40, { freq: 8, volume: 0.5, offset: 0.5 });
      var counter = add(p, 'Counter', 220, 40);
      var sw = add(p, 'Switch', 400, 120, {}, { channels: 4, wrap: true });
      E.normalize(p);
      ['C', 'E', 'G', 'B'].forEach(function (note, k) {
        var m = add(p, 'Music Modulator', 220, 180 + k * 70, {}, { note: note, octave: 5 });
        E.connect(p, m.id, sw.id, 'in' + k);
      });
      var osc = add(p, 'Sawtooth', 580, 120, { volume: 0.4, rf: 0.9 });
      E.connect(p, gate.id, counter.id, 'trigger');
      E.connect(p, counter.id, sw.id, 'select');
      E.connect(p, sw.id, osc.id, 'freq');
      E.connect(p, osc.id, recorder(p, { duration: 2, volume: 2 }).id, 'signal');
      return p;
    },

    'Note (Fourier)': function () {
      // note1.pm: a Fourier wave with a light 10 Hz tremolo, shaped by an ADSR.
      var p = E.createPatch();
      var trem = add(p, 'Sine', 40, 40, { freq: 10, volume: 0.1, offset: 0.9 });
      var wave = add(p, 'Fourier Wave', 220, 100, { freq: 330 }, {
        harmonics: [
          { order: 1, amp: 1, phase: 0 }, { order: 2, amp: 0.5, phase: 0 }, { order: 3, amp: 0.3, phase: 0 },
          { order: 4, amp: 0.2, phase: 0 }, { order: 5, amp: 0.1, phase: 0 }
        ]
      });
      var env = add(p, 'ADSR', 400, 100, {}, { attack: 0.05, decay: 0.2, sustain: 0.6, release: 0.3 });
      E.connect(p, trem.id, wave.id, 'volume');
      E.connect(p, wave.id, env.id, 'signal');
      E.connect(p, env.id, recorder(p, { duration: 1.5, volume: 0.5 }).id, 'signal');
      return p;
    },

    'Spinning coin': function () {
      // grain1.pm: distinct high grains whose gap sweeps from 0.1 s down to 0.01 s.
      var p = E.createPatch();
      var tone = add(p, 'Sine', 40, 40, { freq: 3000 });
      var gap = add(p, 'Sweep', 40, 200, {}, { from: 0.1, to: 0.01 });
      var grains = add(p, 'Granular Synth', 240, 100, { duration: 0.2, volume: 0.5 },
        { sourceDuration: 1, shape: 'Attack/Decay', control: 0.05, seed: 7 });
      E.connect(p, tone.id, grains.id, 'signal');
      E.connect(p, gap.id, grains.id, 'gap');
      E.connect(p, grains.id, recorder(p, { duration: 3, volume: 0.6 }).id, 'signal');
      return p;
    },

    'Grain cloud': function () {
      // grain2.pm: Gaussian grains drawn from anywhere in a sine stepping through 5 pitches.
      var p = E.createPatch();
      var steps = add(p, 'Envelope', 40, 40, {}, {
        sections: [440, 587, 349, 659, 523].map(function (f) {
          return { start: f, sameAsPrevious: false, end: f, duration: 0.2, curve: 'Linear', degree: 3 };
        })
      });
      var tone = add(p, 'Sine', 200, 40);
      var grains = add(p, 'Granular Synth', 360, 100, { gap: 0.001, duration: 0.1, volume: 0.05, pos: 0.5, posR: 0.5 },
        { sourceDuration: 1, shape: 'Gaussian', control: 0.5, seed: 11 });
      E.connect(p, steps.id, tone.id, 'freq');
      E.connect(p, tone.id, grains.id, 'signal');
      E.connect(p, grains.id, recorder(p, { duration: 2 }).id, 'signal');
      return p;
    },

    'Stereo ping-pong': function () {
      // Beeps panned hard left and right by a 0/1 gate, into a stereo Recorder.
      var p = E.createPatch();
      var tone = add(p, 'Sine', 40, 40, { freq: 880 });
      var env = add(p, 'ADSR', 200, 40, {}, { attack: 0.005, decay: 0.12, sustain: 0, release: 0 });
      var seq = add(p, 'Sequencer', 360, 40, {}, { startA: 0, endA: 0.25, repeatA: true });
      var gate = add(p, 'Square', 360, 260, { freq: 2, volume: 0.5, offset: 0.5 });
      var pan = add(p, 'Mono to Stereo Pan', 560, 120);
      E.connect(p, tone.id, env.id, 'signal');
      E.connect(p, env.id, seq.id, 'sigA');
      E.connect(p, seq.id, pan.id, 'signal');
      E.connect(p, gate.id, pan.id, 'pan');
      E.connect(p, pan.id, recorder(p, { duration: 2, stereo: true, volume: 0.8 }).id, 'signal');
      return p;
    },

    'Math chirp': function () {
      // A Math Function: a falling-volume chirp from 200 to 600 Hz.
      var p = E.createPatch();
      var f = add(p, 'Math Function', 200, 120, {}, { expr: 'sin(2*pi*(200+200*x)*t)*(1-x)' });
      E.connect(p, f.id, recorder(p, { duration: 1, volume: 0.9 }).id, 'signal');
      return p;
    }
  };

  // Keep the Recorder to the right of every example's components.
  Object.keys(EXAMPLES).forEach(function (name) {
    var build = EXAMPLES[name];
    EXAMPLES[name] = function () {
      var p = build();
      var rec = E.getRecorder(p);
      var maxX = 0;
      p.components.forEach(function (c) {
        if (c === rec) return;
        c.x = Math.round(c.x * 1.3); // leave room for wires between nodes
        maxX = Math.max(maxX, c.x);
      });
      rec.x = maxX + 200;
      rec.y = 120;
      return p;
    };
  });

  return EXAMPLES;
});
