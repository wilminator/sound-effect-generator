/*
 * Quack patch engine: component definitions, patch editing and offline rendering.
 * No DOM or Web Audio dependencies, so it runs in the browser (as window.QuackEngine)
 * and in Node (via require) for tests.
 *
 * Model (after the original Quack Sound Effects Studio):
 * - A patch is a set of components plus one-to-one connections. Each output feeds
 *   at most one input and each input has at most one source, so the graph is a tree
 *   rooted at the single Recorder.
 * - Rendering is pull-based: the Recorder asks its input for N samples, and each
 *   component asks its own inputs for whatever length it needs. Unconnected inputs
 *   use the constant value set on the component.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var CURVES = ['Linear', 'Slow Start', 'Fast Start'];

  // ---------------------------------------------------------------- helpers

  function frac(x) {
    return x - Math.floor(x);
  }

  /** Envelope curve for a 0..1 segment position u. */
  function curve(type, degree, u) {
    var c = degree;
    if (type === 'Slow Start' && c !== 0) return (1 - Math.exp(c * u)) / (1 - Math.exp(c));
    if (type === 'Fast Start' && c !== 0) return (1 - Math.exp(-c * u)) / (1 - Math.exp(-c));
    return u;
  }

  /** Linear interpolation into a buffer at a fractional index; 0 before the start. */
  function sampleAt(buf, pos) {
    if (pos < 0) return 0;
    var i = Math.floor(pos);
    if (i >= buf.length - 1) return buf[buf.length - 1] || 0;
    var f = pos - i;
    return buf[i] * (1 - f) + buf[i + 1] * f;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function num(key, label, def, extra) {
    var p = { key: key, label: label, type: 'number', default: def };
    if (extra) for (var k in extra) p[k] = extra[k];
    return p;
  }

  // Shared oscillator: Offset + Volume * shape(p), with p = frac(Phase + ∫Freq dt).
  function oscillator(ctx, shape) {
    var freq = ctx.input('freq');
    var volume = ctx.input('volume');
    var phase = ctx.input('phase');
    var offset = ctx.input('offset');
    var extra = shape.input ? ctx.input(shape.input) : null;
    var out = new Float32Array(ctx.n);
    var dt = 1 / ctx.sampleRate;
    var y = 0;
    for (var i = 0; i < ctx.n; i++) {
      var p = frac(phase[i] + y);
      out[i] = offset[i] + volume[i] * shape.fn(p, extra ? extra[i] : 0);
      y = frac(y + freq[i] * dt);
    }
    return out;
  }

  var OSC_INPUTS = [
    { key: 'freq', label: 'Freq', default: 400 },
    { key: 'volume', label: 'Volume', default: 1 },
    { key: 'phase', label: 'Phase', default: 0 },
    { key: 'offset', label: 'Offset', default: 0 }
  ];

  // ---------------------------------------------------------------- components

  var TYPES = {
    Recorder: {
      group: 'Output',
      inputs: [{ key: 'signal', label: 'Signal', default: 0 }],
      props: [
        num('volume', 'Volume', 1),
        num('duration', 'Duration (s)', 1, { min: 0.01, max: 60 }),
        num('sampleRate', 'Samples/sec', 22050, { min: 4000, max: 96000, step: 1 }),
        { key: 'bits', label: 'Bits/sample', type: 'select', options: [8, 16], default: 16 }
      ],
      noOutput: true,
      render: function (ctx) {
        var s = ctx.input('signal');
        var v = ctx.props.volume;
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = s[i] * v;
        return out;
      }
    },

    Sine: {
      group: 'Sources',
      inputs: OSC_INPUTS,
      props: [],
      render: function (ctx) {
        return oscillator(ctx, { fn: function (p) { return Math.sin(2 * Math.PI * p); } });
      }
    },

    Sawtooth: {
      group: 'Sources',
      inputs: OSC_INPUTS.concat([{ key: 'rf', label: 'R/F', default: 0.5 }]),
      props: [],
      render: function (ctx) {
        return oscillator(ctx, {
          input: 'rf',
          fn: function (x, rf) {
            rf = Math.min(1, Math.max(0, rf));
            if (rf <= 0) return 2 * (1 - x) - 1;
            if (rf >= 1) return 2 * x - 1;
            return x < rf ? (2 * x) / rf - 1 : (2 * (1 - x)) / (1 - rf) - 1;
          }
        });
      }
    },

    Square: {
      group: 'Sources',
      inputs: OSC_INPUTS.concat([{ key: 'ms', label: 'M/S', default: 0.5 }]),
      props: [],
      render: function (ctx) {
        return oscillator(ctx, { input: 'ms', fn: function (x, ms) { return x < ms ? 1 : -1; } });
      }
    },

    Noise: {
      group: 'Sources',
      inputs: [
        { key: 'volume', label: 'Volume', default: 1 },
        { key: 'offset', label: 'Offset', default: 0 }
      ],
      // Each Noise carries its own seed, so a saved patch always renders the same sound.
      props: [num('seed', 'Seed', 1, { min: 0, max: 4294967295, step: 1 })],
      render: function (ctx) {
        var rng = mulberry32(ctx.props.seed);
        var volume = ctx.input('volume');
        var offset = ctx.input('offset');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = offset[i] + volume[i] * (rng() * 2 - 1);
        return out;
      }
    },

    Mixer: {
      group: 'Mixers',
      inputs: ['A', 'B', 'C', 'D'].map(function (l) {
        return { key: 'sig' + l, label: 'Sig ' + l, default: 0 };
      }),
      props: ['A', 'B', 'C', 'D'].map(function (l) { return num('vol' + l, 'Volume ' + l, 1); }),
      render: function (ctx) {
        var out = new Float32Array(ctx.n);
        ['A', 'B', 'C', 'D'].forEach(function (l) {
          var s = ctx.input('sig' + l);
          var v = ctx.props['vol' + l];
          for (var i = 0; i < ctx.n; i++) out[i] += s[i] * v;
        });
        return out;
      }
    },

    Modulator: {
      group: 'Mixers',
      inputs: [
        { key: 'sigA', label: 'Sig A', default: 1 },
        { key: 'sigB', label: 'Sig B', default: 1 }
      ],
      props: [],
      render: function (ctx) {
        var a = ctx.input('sigA');
        var b = ctx.input('sigB');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = a[i] * b[i];
        return out;
      }
    },

    Merger: {
      group: 'Mixers',
      inputs: [
        { key: 'sigA', label: 'Sig A', default: 0 },
        { key: 'sigB', label: 'Sig B', default: 0 },
        { key: 'ba', label: 'B/A', default: 0.5 }
      ],
      props: [],
      render: function (ctx) {
        var a = ctx.input('sigA');
        var b = ctx.input('sigB');
        var ba = ctx.input('ba');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = a[i] * ba[i] + b[i] * (1 - ba[i]);
        return out;
      }
    },

    Sequencer: {
      group: 'Mixers',
      inputs: ['A', 'B', 'C', 'D'].map(function (l) {
        return { key: 'sig' + l, label: 'Signal ' + l, default: 0 };
      }),
      props: [].concat.apply([], ['A', 'B', 'C', 'D'].map(function (l, idx) {
        return [
          num('start' + l, l + ' start (s)', 0, { min: 0 }),
          num('end' + l, l + ' end (s)', idx === 0 ? 1 : 0, { min: 0 }),
          { key: 'repeat' + l, label: l + ' repeat', type: 'bool', default: false }
        ];
      })),
      render: function (ctx) {
        var out = new Float32Array(ctx.n);
        var sr = ctx.sampleRate;
        ['A', 'B', 'C', 'D'].forEach(function (l) {
          var start = Math.round(ctx.props['start' + l] * sr);
          var len = Math.round((ctx.props['end' + l] - ctx.props['start' + l]) * sr);
          if (len <= 0 || start >= ctx.n) return;
          var seg = ctx.input('sig' + l, len);
          var at = start;
          do {
            for (var i = 0; i < len && at + i < ctx.n; i++) out[at + i] += seg[i];
            at += len;
          } while (ctx.props['repeat' + l] && at < ctx.n);
        });
        return out;
      }
    },

    'Music Modulator': {
      group: 'Mixers',
      inputs: [{ key: 'signal', label: 'Signal (semitones)', default: 0 }],
      props: [
        { key: 'note', label: 'Note', type: 'select', options: NOTE_NAMES, default: 'A' },
        num('octave', 'Octave', 5, { min: 0, max: 10, step: 1 })
      ],
      render: function (ctx) {
        var idx = NOTE_NAMES.indexOf(ctx.props.note);
        // Octave 5 holds middle C, so A in octave 5 is 440 Hz.
        var base = 440 * Math.pow(2, (idx - 9) / 12 + (ctx.props.octave - 5));
        var s = ctx.input('signal');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = base * Math.pow(2, s[i] / 12);
        return out;
      }
    },

    Switch: {
      group: 'Mixers',
      // Outputs In k, where k = floor(Select). Select can change on any sample, so it
      // switches as often as its signal does. Wrap cycles k past the last input.
      inputsFor: function (c) {
        var list = [{ key: 'select', label: 'Select', default: 0 }];
        for (var k = 0; k < c.props.channels; k++) list.push({ key: 'in' + k, label: 'In ' + k, default: 0 });
        return list;
      },
      props: [
        num('channels', 'Inputs', 2, { min: 2, max: 64, step: 1 }),
        { key: 'wrap', label: 'Wrap around', type: 'bool', default: false }
      ],
      render: function (ctx) {
        var count = ctx.props.channels;
        var sel = ctx.input('select');
        var ins = [];
        for (var k = 0; k < count; k++) ins.push(ctx.input('in' + k));
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) {
          var idx = Math.floor(sel[i]);
          if (ctx.props.wrap) idx = ((idx % count) + count) % count;
          else idx = Math.min(count - 1, Math.max(0, idx));
          out[i] = ins[idx][i];
        }
        return out;
      }
    },

    Counter: {
      group: 'Mixers',
      // Adds Step on each positive edge of Trigger (from <= 0 to > 0). A trigger that
      // starts above 0 counts once at the start. A positive edge on Reset returns to Start.
      inputs: [
        { key: 'trigger', label: 'Trigger', default: 0 },
        { key: 'step', label: 'Step', default: 1 },
        { key: 'reset', label: 'Reset', default: 0 }
      ],
      props: [num('start', 'Start value', 0)],
      render: function (ctx) {
        var trig = ctx.input('trigger');
        var step = ctx.input('step');
        var reset = ctx.input('reset');
        var out = new Float32Array(ctx.n);
        var value = ctx.props.start;
        var prevT = 0;
        var prevR = 0;
        for (var i = 0; i < ctx.n; i++) {
          if (reset[i] > 0 && prevR <= 0) value = ctx.props.start;
          else if (trig[i] > 0 && prevT <= 0) value += step[i];
          prevT = trig[i];
          prevR = reset[i];
          out[i] = value;
        }
        return out;
      }
    },

    Patch: {
      group: 'Sources',
      // Plays another saved patch as a source. The nested patch is stored inside this
      // one, renders at the parent's sample rate and length, and keeps its Recorder volume.
      inputs: [{ key: 'volume', label: 'Volume', default: 1 }],
      props: [{ key: 'patch', label: 'Patch file', type: 'patch', default: null }],
      render: function (ctx) {
        var out = new Float32Array(ctx.n);
        if (!ctx.props.patch) return out;
        if (ctx.depth >= MAX_NESTING) throw new Error('Patches are nested too deeply');
        var inner = nestedPatch(ctx.props.patch);
        var sig = renderNode(inner, getRecorder(inner).id, ctx.n, ctx.sampleRate, ctx.depth + 1);
        var vol = ctx.input('volume');
        for (var i = 0; i < ctx.n; i++) out[i] = sig[i] * vol[i];
        return out;
      }
    },

    Sweep: {
      group: 'Envelopes',
      inputs: [{ key: 'signal', label: 'Signal', default: 1 }],
      props: [num('from', 'From', 0), num('to', 'To', 1)],
      render: function (ctx) {
        var s = ctx.input('signal');
        var from = ctx.props.from;
        var to = ctx.props.to;
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = s[i] * (from + (to - from) * (i / ctx.n));
        return out;
      }
    },

    ADSR: {
      group: 'Envelopes',
      inputs: [{ key: 'signal', label: 'Signal', default: 1 }],
      props: [
        num('attack', 'Attack time (s)', 0.02, { min: 0 }),
        num('peak', 'Attack peak', 1),
        num('decay', 'Decay time (s)', 0.1, { min: 0 }),
        num('sustain', 'Sustain level', 0.7),
        num('release', 'Release time (s)', 0.2, { min: 0 }),
        { key: 'curve', label: 'Curve type', type: 'select', options: CURVES, default: 'Linear' },
        num('degree', 'Curve degree', 3)
      ],
      render: function (ctx) {
        var env = adsrEnvelope(ctx.props, ctx.n, ctx.sampleRate);
        var s = ctx.input('signal');
        for (var i = 0; i < ctx.n; i++) env[i] *= s[i];
        return env;
      }
    },

    'Comb Filter': {
      group: 'Filters',
      inputs: [
        { key: 'signal', label: 'Signal', default: 0 },
        { key: 'freq', label: 'Frequency', default: 100 },
        { key: 'strength', label: 'Strength', default: 0.5 }
      ],
      props: [],
      render: function (ctx) {
        var s = ctx.input('signal');
        var f = ctx.input('freq');
        var str = ctx.input('strength');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) {
          var delay = ctx.sampleRate / Math.max(1, f[i]);
          out[i] = s[i] + str[i] * sampleAt(s, i - delay);
        }
        return out;
      }
    },

    Echo: {
      group: 'Filters',
      inputs: [
        { key: 'signal', label: 'Signal', default: 0 },
        { key: 'delay', label: 'Delay (s)', default: 0.25 },
        { key: 'strength', label: 'Strength', default: 0.5 }
      ],
      props: [
        { key: 'multiple', label: 'Repeating echoes', type: 'bool', default: false },
        num('maxDelay', 'Max delay (s)', 1, { min: 0 })
      ],
      render: function (ctx) {
        var s = ctx.input('signal');
        var d = ctx.input('delay');
        var str = ctx.input('strength');
        var multiple = ctx.props.multiple;
        var out = new Float32Array(ctx.n);
        var src = multiple ? out : s;
        for (var i = 0; i < ctx.n; i++) {
          var delay = Math.min(Math.max(d[i], 0), ctx.props.maxDelay) * ctx.sampleRate;
          // A repeating echo feeds back its own output, so it needs at least one sample of delay.
          if (multiple) delay = Math.max(delay, 1);
          out[i] = s[i] + str[i] * sampleAt(src, i - delay);
        }
        return out;
      }
    },

    Fuzz: {
      group: 'Filters',
      inputs: [
        { key: 'signal', label: 'Signal', default: 0 },
        { key: 'upper', label: 'Upper', default: 0.5 },
        { key: 'lower', label: 'Lower', default: -0.5 }
      ],
      props: [
        { key: 'forceZero', label: 'Force to zero', type: 'bool', default: false },
        { key: 'symmetrical', label: 'Symmetrical', type: 'bool', default: false }
      ],
      render: function (ctx) {
        var s = ctx.input('signal');
        var up = ctx.input('upper');
        var lo = ctx.input('lower');
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) {
          var u = up[i];
          var l = ctx.props.symmetrical ? -Math.abs(u) : lo[i];
          if (ctx.props.symmetrical) u = Math.abs(u);
          var v = Math.min(u, Math.max(l, s[i]));
          out[i] = ctx.props.forceZero ? v - l : v;
        }
        return out;
      }
    },

    'Moving Average': {
      group: 'Filters',
      inputs: [
        { key: 'signal', label: 'Signal', default: 0 },
        { key: 'strength', label: 'Strength', default: 1 },
        // The original calls this input "Frequency" but describes it as a window width.
        { key: 'width', label: 'Width (s)', default: 0.001 }
      ],
      props: [{ key: 'mode', label: 'Type', type: 'select', options: ['Low-pass', 'High-pass'], default: 'Low-pass' }],
      render: function (ctx) {
        var s = ctx.input('signal');
        var str = ctx.input('strength');
        var w = ctx.input('width');
        var prefix = new Float64Array(ctx.n + 1);
        for (var i = 0; i < ctx.n; i++) prefix[i + 1] = prefix[i] + s[i];
        var out = new Float32Array(ctx.n);
        var hp = ctx.props.mode === 'High-pass';
        for (var j = 0; j < ctx.n; j++) {
          var width = Math.max(1, Math.round(w[j] * ctx.sampleRate));
          var from = Math.max(0, j + 1 - width);
          var avg = (prefix[j + 1] - prefix[from]) / (j + 1 - from);
          out[j] = hp ? s[j] - str[j] * avg : (1 - str[j]) * s[j] + str[j] * avg;
        }
        return out;
      }
    }
  };

  /** ADSR envelope; sustain stretches to fill n samples, and A/D/R shrink if they don't fit. */
  function adsrEnvelope(props, n, sampleRate) {
    var a = Math.max(0, props.attack) * sampleRate;
    var d = Math.max(0, props.decay) * sampleRate;
    var r = Math.max(0, props.release) * sampleRate;
    if (a + d + r > n && a + d + r > 0) {
      var k = n / (a + d + r);
      a *= k; d *= k; r *= k;
    }
    var relStart = n - r;
    var env = new Float32Array(n);
    function seg(from, to, u) { return from + (to - from) * curve(props.curve, props.degree, u); }
    for (var i = 0; i < n; i++) {
      if (i < a) env[i] = seg(0, props.peak, i / a);
      else if (i < a + d) env[i] = seg(props.peak, props.sustain, (i - a) / d);
      else if (i < relStart) env[i] = props.sustain;
      else env[i] = seg(props.sustain, 0, r > 0 ? (i - relStart) / r : 1);
    }
    return env;
  }

  // ---------------------------------------------------------------- patch editing

  var MAX_NESTING = 16;
  var nestedCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Parses an embedded patch once and reuses it while the stored object is unchanged. */
  function nestedPatch(data) {
    if (nestedCache && typeof data === 'object' && nestedCache.has(data)) return nestedCache.get(data);
    var p = parse(data);
    if (nestedCache && typeof data === 'object') nestedCache.set(data, p);
    return p;
  }

  /** The inputs a component has; for some types (Switch) this depends on its properties. */
  function inputsOf(c) {
    var def = TYPES[c.type];
    return def.inputsFor ? def.inputsFor(c) : def.inputs;
  }

  function defaultsFor(type) {
    var def = TYPES[type];
    var inputs = {};
    var props = {};
    def.props.forEach(function (p) { props[p.key] = p.default; });
    inputsOf({ type: type, props: props }).forEach(function (i) { inputs[i.key] = i.default; });
    return { inputs: inputs, props: props };
  }

  /**
   * Call after changing a component's properties: fills defaults for inputs that
   * appeared and drops connections to inputs that no longer exist.
   */
  function normalize(patch) {
    patch.components.forEach(function (c) {
      inputsOf(c).forEach(function (i) {
        if (c.inputs[i.key] === undefined) c.inputs[i.key] = i.default;
      });
    });
    patch.connections = patch.connections.filter(function (k) {
      var to = getComponent(patch, k.to);
      return to && inputsOf(to).some(function (i) { return i.key === k.input; });
    });
  }

  function makeComponent(patch, type, x, y) {
    var d = defaultsFor(type);
    var base = type.replace(/\s+/g, '');
    var k = 1;
    while (patch.components.some(function (c) { return c.name === base + k; })) k++;
    return {
      id: 'c' + (patch.nextId++),
      type: type,
      name: base + k,
      x: x || 0,
      y: y || 0,
      inputs: d.inputs,
      props: d.props
    };
  }

  /** A new patch holding only its Recorder. */
  function createPatch() {
    var patch = { version: 1, nextId: 1, components: [], connections: [] };
    var rec = makeComponent(patch, 'Recorder', 600, 120);
    rec.name = 'Recorder';
    patch.components.push(rec);
    return patch;
  }

  function getComponent(patch, id) {
    for (var i = 0; i < patch.components.length; i++) {
      if (patch.components[i].id === id) return patch.components[i];
    }
    return null;
  }

  function getRecorder(patch) {
    return patch.components.filter(function (c) { return c.type === 'Recorder'; })[0];
  }

  function addComponent(patch, type, x, y) {
    if (!TYPES[type]) throw new Error('Unknown component type: ' + type);
    if (type === 'Recorder') throw new Error('A patch has exactly one Recorder');
    var c = makeComponent(patch, type, x, y);
    if (type === 'Noise') c.props.seed = Math.floor(Math.random() * 4294967296);
    patch.components.push(c);
    return c;
  }

  function removeComponent(patch, id) {
    var c = getComponent(patch, id);
    if (!c) return;
    if (c.type === 'Recorder') throw new Error('The Recorder cannot be deleted');
    patch.components = patch.components.filter(function (x) { return x.id !== id; });
    patch.connections = patch.connections.filter(function (k) { return k.from !== id && k.to !== id; });
  }

  /** The connection feeding a component's input, if any. */
  function sourceOf(patch, toId, input) {
    for (var i = 0; i < patch.connections.length; i++) {
      var k = patch.connections[i];
      if (k.to === toId && k.input === input) return k;
    }
    return null;
  }

  /** True when `id` is `targetId` or feeds into it, directly or through other components. */
  function feeds(patch, id, targetId) {
    if (id === targetId) return true;
    var out = patch.connections.filter(function (k) { return k.from === id; })[0];
    return out ? feeds(patch, out.to, targetId) : false;
  }

  /**
   * Connects fromId's output to toId's input. Like the original, any connection
   * that conflicts (the same output, or the same input) is replaced.
   */
  function connect(patch, fromId, toId, input) {
    var from = getComponent(patch, fromId);
    var to = getComponent(patch, toId);
    if (!from || !to) throw new Error('Unknown component');
    if (TYPES[from.type].noOutput) throw new Error(from.name + ' has no output');
    if (!inputsOf(to).some(function (i) { return i.key === input; })) {
      throw new Error(to.name + ' has no input ' + input);
    }
    if (fromId === toId) throw new Error('A component cannot connect to itself');
    // to must not already feed from; otherwise this would create a loop.
    if (feeds(patch, toId, fromId)) throw new Error('That connection would create a loop');
    patch.connections = patch.connections.filter(function (k) {
      return k.from !== fromId && !(k.to === toId && k.input === input);
    });
    patch.connections.push({ from: fromId, to: toId, input: input });
  }

  function disconnectOutput(patch, fromId) {
    patch.connections = patch.connections.filter(function (k) { return k.from !== fromId; });
  }

  function disconnectInput(patch, toId, input) {
    patch.connections = patch.connections.filter(function (k) { return !(k.to === toId && k.input === input); });
  }

  // ---------------------------------------------------------------- rendering

  /** Renders one component's output for n samples. */
  function renderNode(patch, id, n, sampleRate, depth) {
    var c = getComponent(patch, id);
    if (!c) throw new Error('Unknown component ' + id);
    var def = TYPES[c.type];
    var ctx = {
      id: c.id,
      n: n,
      sampleRate: sampleRate,
      depth: depth || 0,
      props: c.props,
      input: function (key, len) {
        len = len === undefined ? n : len;
        var k = sourceOf(patch, c.id, key);
        if (k) return renderNode(patch, k.from, len, sampleRate, depth);
        var v = Number(c.inputs[key]);
        return new Float32Array(len).fill(isFinite(v) ? v : 0);
      }
    };
    return def.render(ctx);
  }

  /**
   * Renders the whole patch through its Recorder. Returns the samples, the peak,
   * and a suggested Recorder volume when the peak falls outside 0.5..1.
   */
  function render(patch) {
    var rec = getRecorder(patch);
    var sampleRate = Math.round(rec.props.sampleRate);
    var n = Math.max(1, Math.round(rec.props.duration * sampleRate));
    var samples = renderNode(patch, rec.id, n, sampleRate);
    var peak = 0;
    for (var i = 0; i < n; i++) {
      var a = Math.abs(samples[i]);
      if (a > peak) peak = a;
    }
    var suggestedVolume = null;
    if (peak > 0 && (peak < 0.5 || peak > 1)) {
      suggestedVolume = Math.round((rec.props.volume * 0.9 / peak) * 1000) / 1000;
    }
    return {
      samples: samples,
      sampleRate: sampleRate,
      bits: Number(rec.props.bits),
      peak: peak,
      suggestedVolume: suggestedVolume
    };
  }

  /** Encodes mono samples as an 8- or 16-bit PCM WAV file. Samples are clipped to ±1. */
  function encodeWav(samples, sampleRate, bits) {
    bits = bits === 8 ? 8 : 16;
    var bytes = bits / 8;
    var dataSize = samples.length * bytes;
    var buf = new ArrayBuffer(44 + dataSize);
    var view = new DataView(buf);
    function str(off, s) {
      for (var i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i));
    }
    str(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    str(8, 'WAVE');
    str(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * bytes, true);
    view.setUint16(32, bytes, true);
    view.setUint16(34, bits, true);
    str(36, 'data');
    view.setUint32(40, dataSize, true);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.min(1, Math.max(-1, samples[i]));
      if (bits === 8) view.setUint8(44 + i, Math.round((s + 1) * 127.5));
      else view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Uint8Array(buf);
  }

  // ---------------------------------------------------------------- save / load

  function serialize(patch) {
    return JSON.stringify(patch, null, 2);
  }

  /** Parses a saved patch, filling defaults and dropping invalid connections. */
  function parse(text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || !Array.isArray(data.components)) throw new Error('Not a Quack patch');
    var patch = { version: 1, nextId: 1, components: [], connections: [] };
    var maxId = 0;
    data.components.forEach(function (c) {
      if (!TYPES[c.type]) throw new Error('Unknown component type: ' + c.type);
      var d = defaultsFor(c.type);
      Object.keys(d.props).forEach(function (k) {
        if (c.props && c.props[k] !== undefined) d.props[k] = c.props[k];
      });
      inputsOf({ type: c.type, props: d.props }).forEach(function (i) {
        d.inputs[i.key] = c.inputs && c.inputs[i.key] !== undefined ? Number(c.inputs[i.key]) : i.default;
      });
      patch.components.push({
        id: String(c.id), type: c.type, name: String(c.name || c.type),
        x: Number(c.x) || 0, y: Number(c.y) || 0, inputs: d.inputs, props: d.props
      });
      var m = /^c(\d+)$/.exec(c.id);
      if (m) maxId = Math.max(maxId, Number(m[1]));
    });
    var recorders = patch.components.filter(function (c) { return c.type === 'Recorder'; });
    if (recorders.length !== 1) throw new Error('A patch must have exactly one Recorder');
    patch.nextId = Math.max(Number(data.nextId) || 0, maxId + 1);
    (data.connections || []).forEach(function (k) {
      try { connect(patch, k.from, k.to, k.input); } catch (e) { /* skip invalid */ }
    });
    return patch;
  }

  return {
    TYPES: TYPES,
    NOTE_NAMES: NOTE_NAMES,
    CURVES: CURVES,
    curve: curve,
    adsrEnvelope: adsrEnvelope,
    inputsOf: inputsOf,
    normalize: normalize,
    createPatch: createPatch,
    addComponent: addComponent,
    removeComponent: removeComponent,
    getComponent: getComponent,
    getRecorder: getRecorder,
    connect: connect,
    sourceOf: sourceOf,
    disconnectOutput: disconnectOutput,
    disconnectInput: disconnectInput,
    renderNode: renderNode,
    render: render,
    encodeWav: encodeWav,
    serialize: serialize,
    parse: parse
  };
});
