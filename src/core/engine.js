/*
 * SEGway core engine: the component registry, patch rules, and offline rendering.
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
 * - Signals are mono Float32Arrays, or { left, right } pairs from stereo outputs.
 *   ctx.input() always gives mono (stereo is averaged); ctx.inputStereo() always
 *   gives a pair (mono is duplicated).
 *
 * Components live in src/modules/ and register themselves with register().
 * A component definition is:
 *   {
 *     group: 'Sources' | 'Mixers' | 'Envelopes' | 'Filters' | 'Stereo' | 'Output',
 *     help: 'one-line description',
 *     inputs: [{ key, label, default, stereo? }]   or inputsFor(component) -> same,
 *     props: [prop specs, see PROP_TYPES],
 *     stereoOutput: bool | function(component) -> bool,
 *     noOutput: bool,                    (Recorder only)
 *     validate: function(component) -> error string | null,
 *     actions: [{ label, fields?: [{key,label,default}], file?: 'text'|'binary',
 *                 run: function(component, { values, text, bytes, name }) }],
 *     render: function(ctx) -> Float32Array | { left, right }
 *   }
 * ctx = { id, n, sampleRate, duration, props, depth, input(key, len?), inputStereo(key, len?),
 *         isConnected(key) }
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var TYPES = {};
  var GROUPS = ['Sources', 'Mixers', 'Envelopes', 'Filters', 'Stereo'];
  var MAX_NESTING = 16;

  /*
   * Property types the UI knows how to edit:
   *   number  { min?, max?, step? }       select { options }       bool
   *   text    { multiline? }              patch (an embedded saved patch, or null)
   *   file    { accept? } value { name, data (base64) } or null
   *   table   { columns: [{ key, label, type: 'number'|'select'|'bool'|'text', options?, default }] }
   *           value: array of row objects
   */
  var PROP_TYPES = ['number', 'select', 'bool', 'text', 'patch', 'file', 'table'];

  // ---------------------------------------------------------------- helpers for modules

  function frac(x) {
    return x - Math.floor(x);
  }

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  /** Envelope curve for a 0..1 segment position u (from the original help). */
  function curve(type, degree, u) {
    var c = degree;
    if (type === 'Slow Start' && c !== 0) return (1 - Math.exp(c * u)) / (1 - Math.exp(c));
    if (type === 'Fast Start' && c !== 0) return (1 - Math.exp(-c * u)) / (1 - Math.exp(-c));
    return u;
  }
  var CURVES = ['Linear', 'Slow Start', 'Fast Start'];

  /** Linear interpolation into a buffer at a fractional index; 0 before the start. */
  function sampleAt(buf, pos) {
    if (pos < 0) return 0;
    var i = Math.floor(pos);
    if (i >= buf.length - 1) return buf[buf.length - 1] || 0;
    var f = pos - i;
    return buf[i] * (1 - f) + buf[i + 1] * f;
  }

  /** Small seeded PRNG returning floats in [0, 1). */
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

  /** A number property spec. */
  function num(key, label, def, extra) {
    var p = { key: key, label: label, type: 'number', default: def };
    if (extra) for (var k in extra) p[k] = extra[k];
    return p;
  }

  var OSC_INPUTS = [
    { key: 'freq', label: 'Freq', default: 400 },
    { key: 'volume', label: 'Volume', default: 1 },
    { key: 'phase', label: 'Phase', default: 0 },
    { key: 'offset', label: 'Offset', default: 0 }
  ];

  /**
   * Shared oscillator: Offset + Volume * shape(p, extra), with p = frac(Phase + ∫Freq dt).
   * shape.input names one extra input whose value is passed to shape.fn.
   */
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
      out[i] = offset[i] + volume[i] * shape.fn(p, extra ? extra[i] : 0, i);
      y = frac(y + freq[i] * dt);
    }
    return out;
  }

  function isStereo(sig) {
    return !!sig && !(sig instanceof Float32Array) && sig.left instanceof Float32Array;
  }

  function toMono(sig) {
    if (!isStereo(sig)) return sig;
    var out = new Float32Array(sig.left.length);
    for (var i = 0; i < out.length; i++) out[i] = (sig.left[i] + sig.right[i]) / 2;
    return out;
  }

  function toStereo(sig) {
    return isStereo(sig) ? sig : { left: sig, right: sig };
  }

  function deepCopy(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  // ---------------------------------------------------------------- registry

  /** Registers a component type. Modules call this when they load. */
  function register(type, def) {
    if (!type || typeof def.render !== 'function') throw new Error('A component needs a type and a render function');
    if (TYPES[type]) throw new Error('Component type already registered: ' + type);
    if (!def.inputs && !def.inputsFor) def.inputs = [];
    def.props = def.props || [];
    def.props.forEach(function (p) {
      if (PROP_TYPES.indexOf(p.type) < 0) throw new Error(type + '.' + p.key + ': unknown property type ' + p.type);
    });
    def.type = type;
    TYPES[type] = def;
    return def;
  }

  function types() {
    return Object.keys(TYPES);
  }

  // ---------------------------------------------------------------- patch editing

  /** The inputs a component has; for some types this depends on its properties. */
  function inputsOf(c) {
    var def = TYPES[c.type];
    return def.inputsFor ? def.inputsFor(c) : def.inputs;
  }

  function isStereoOutput(c) {
    var s = TYPES[c.type].stereoOutput;
    return typeof s === 'function' ? !!s(c) : !!s;
  }

  function defaultsFor(type) {
    var def = TYPES[type];
    var inputs = {};
    var props = {};
    def.props.forEach(function (p) { props[p.key] = deepCopy(p.default); });
    inputsOf({ type: type, props: props }).forEach(function (i) { inputs[i.key] = i.default; });
    return { inputs: inputs, props: props };
  }

  function makeComponent(patch, type, x, y) {
    var d = defaultsFor(type);
    var base = type.replace(/[^A-Za-z0-9]+/g, '');
    var k = 1;
    while (patch.components.some(function (c) { return c.name === base + k; })) k++;
    var c = {
      id: 'c' + (patch.nextId++),
      type: type,
      name: base + k,
      x: x || 0,
      y: y || 0,
      inputs: d.inputs,
      props: d.props
    };
    if (TYPES[type].init) TYPES[type].init(c);
    return c;
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
    patch.components.push(c);
    return c;
  }

  /** Copies a component's inputs and properties into a new component (copy/paste, duplicate). */
  function duplicateComponent(patch, id, dx, dy) {
    var src = getComponent(patch, id);
    if (!src) throw new Error('Unknown component ' + id);
    var c = addComponent(patch, src.type, src.x + (dx === undefined ? 30 : dx), src.y + (dy === undefined ? 30 : dy));
    c.inputs = deepCopy(src.inputs);
    c.props = deepCopy(src.props);
    return c;
  }

  function removeComponent(patch, id) {
    var c = getComponent(patch, id);
    if (!c) return;
    if (c.type === 'Recorder') throw new Error('The Recorder cannot be deleted');
    patch.components = patch.components.filter(function (x) { return x.id !== id; });
    patch.connections = patch.connections.filter(function (k) { return k.from !== id && k.to !== id; });
  }

  function renameComponent(patch, id, name) {
    var c = getComponent(patch, id);
    name = String(name || '').trim();
    if (!c || !name) return;
    c.name = name;
  }

  /** The connection feeding a component's input, if any. */
  function sourceOf(patch, toId, input) {
    for (var i = 0; i < patch.connections.length; i++) {
      var k = patch.connections[i];
      if (k.to === toId && k.input === input) return k;
    }
    return null;
  }

  /** The connection leaving a component's output, if any. */
  function targetOf(patch, fromId) {
    for (var i = 0; i < patch.connections.length; i++) {
      if (patch.connections[i].from === fromId) return patch.connections[i];
    }
    return null;
  }

  /** True when `id` is `targetId` or feeds into it, directly or through other components. */
  function feeds(patch, id, targetId) {
    var seen = {};
    while (id && !seen[id]) {
      if (id === targetId) return true;
      seen[id] = true;
      var out = targetOf(patch, id);
      id = out ? out.to : null;
    }
    return false;
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
      return to && getComponent(patch, k.from) && inputsOf(to).some(function (i) { return i.key === k.input; });
    });
  }

  /** Validation errors for every component that defines validate(), as [{ id, name, error }]. */
  function validate(patch) {
    var errors = [];
    patch.components.forEach(function (c) {
      var v = TYPES[c.type].validate;
      var err = v ? v(c) : null;
      if (err) errors.push({ id: c.id, name: c.name, error: err });
    });
    return errors;
  }

  // ---------------------------------------------------------------- custom components

  /** A custom component file (.ccf.json): a component's type, inputs and properties as new defaults. */
  function saveCustom(c) {
    return { quackCustomComponent: 1, type: c.type, name: c.name.replace(/\d+$/, '') || c.type, inputs: deepCopy(c.inputs), props: deepCopy(c.props) };
  }

  function addCustom(patch, ccf, x, y) {
    var data = typeof ccf === 'string' ? JSON.parse(ccf) : ccf;
    if (!data || !data.quackCustomComponent || !TYPES[data.type]) throw new Error('Not a SEGway custom component');
    var c = addComponent(patch, data.type, x, y);
    Object.keys(data.props || {}).forEach(function (k) {
      if (k in c.props) c.props[k] = deepCopy(data.props[k]);
    });
    normalize(patch);
    Object.keys(data.inputs || {}).forEach(function (k) {
      if (k in c.inputs) c.inputs[k] = Number(data.inputs[k]);
    });
    var base = String(data.name || data.type).replace(/[^A-Za-z0-9 _-]+/g, '') || data.type;
    var n = 1;
    while (patch.components.some(function (o) { return o !== c && o.name === base + n; })) n++;
    c.name = base + n;
    return c;
  }

  // ---------------------------------------------------------------- rendering

  /**
   * Renders one component's output for n samples. Returns a Float32Array, or
   * { left, right } for stereo outputs. opts.taps, if given, is an object that
   * receives each component's most recent output by id (for scopes).
   */
  function renderNode(patch, id, n, sampleRate, depth, opts) {
    var c = getComponent(patch, id);
    if (!c) throw new Error('Unknown component ' + id);
    var def = TYPES[c.type];
    depth = depth || 0;
    function pull(key, len) {
      len = len === undefined ? n : len;
      var k = sourceOf(patch, c.id, key);
      if (k) return renderNode(patch, k.from, len, sampleRate, depth, opts);
      var v = Number(c.inputs[key]);
      return new Float32Array(len).fill(isFinite(v) ? v : 0);
    }
    var ctx = {
      id: c.id,
      n: n,
      sampleRate: sampleRate,
      duration: n / sampleRate,
      depth: depth,
      props: c.props,
      component: c,
      input: function (key, len) { return toMono(pull(key, len)); },
      inputStereo: function (key, len) { return toStereo(pull(key, len)); },
      isConnected: function (key) { return !!sourceOf(patch, c.id, key); }
    };
    var out = def.render(ctx);
    if (opts && opts.taps) opts.taps[c.id] = out;
    return out;
  }

  /**
   * Renders the whole patch through its Recorder. Returns { channels, sampleRate,
   * bits, peak, suggestedVolume, taps }. channels holds one array (mono) or two
   * (stereo). suggestedVolume is set when the peak falls outside 0.5..1.
   */
  function render(patch, options) {
    var errors = validate(patch);
    if (errors.length) throw new Error(errors[0].name + ': ' + errors[0].error);
    var rec = getRecorder(patch);
    var sampleRate = Math.round(rec.props.sampleRate);
    var n = Math.max(1, Math.round(rec.props.duration * sampleRate));
    var opts = { taps: options && options.taps ? {} : null };
    var out = renderNode(patch, rec.id, n, sampleRate, 0, opts);
    var channels = isStereo(out) ? [out.left, out.right] : [out];
    var peak = 0;
    channels.forEach(function (ch) {
      for (var i = 0; i < ch.length; i++) {
        var a = Math.abs(ch[i]);
        if (a > peak) peak = a;
        else if (a !== a) throw new Error('The sound contains invalid values (NaN)');
      }
    });
    var suggestedVolume = null;
    if (peak > 0 && (peak < 0.5 || peak > 1)) {
      suggestedVolume = Math.round((rec.props.volume * 0.9 / peak) * 1000) / 1000;
    }
    return {
      channels: channels,
      sampleRate: sampleRate,
      bits: Number(rec.props.bits),
      peak: peak,
      suggestedVolume: suggestedVolume,
      taps: opts.taps
    };
  }

  // ---------------------------------------------------------------- save / load

  function serialize(patch) {
    return JSON.stringify(patch, null, 2);
  }

  /** Parses a saved patch, filling defaults and dropping invalid connections. */
  function parse(text) {
    var data = typeof text === 'string' ? JSON.parse(text) : text;
    if (!data || !Array.isArray(data.components)) throw new Error('Not a SEGway patch');
    var patch = { version: 1, nextId: 1, components: [], connections: [] };
    var maxId = 0;
    data.components.forEach(function (c) {
      if (!TYPES[c.type]) throw new Error('Unknown component type: ' + c.type);
      var d = defaultsFor(c.type);
      Object.keys(d.props).forEach(function (k) {
        if (c.props && c.props[k] !== undefined) d.props[k] = deepCopy(c.props[k]);
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

  var nestedCache = typeof WeakMap === 'function' ? new WeakMap() : null;

  /** Parses an embedded patch once and reuses it while the stored object is unchanged. */
  function nestedPatch(data) {
    if (nestedCache && data && typeof data === 'object' && nestedCache.has(data)) return nestedCache.get(data);
    var p = parse(data);
    if (nestedCache && data && typeof data === 'object') nestedCache.set(data, p);
    return p;
  }

  // ---------------------------------------------------------------- base64 (for embedded files)

  var B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  function bytesToBase64(bytes) {
    var out = '';
    for (var i = 0; i < bytes.length; i += 3) {
      var a = bytes[i], b = bytes[i + 1], c = bytes[i + 2];
      var t = (a << 16) | ((b || 0) << 8) | (c || 0);
      out += B64[(t >> 18) & 63] + B64[(t >> 12) & 63] +
        (i + 1 < bytes.length ? B64[(t >> 6) & 63] : '=') +
        (i + 2 < bytes.length ? B64[t & 63] : '=');
    }
    return out;
  }

  function base64ToBytes(s) {
    s = String(s).replace(/[^A-Za-z0-9+/]/g, '');
    var out = new Uint8Array(Math.floor((s.length * 3) / 4));
    var o = 0;
    for (var i = 0; i < s.length; i += 4) {
      var t = 0;
      for (var j = 0; j < 4; j++) t = (t << 6) | (i + j < s.length ? B64.indexOf(s[i + j]) : 0);
      if (o < out.length) out[o++] = (t >> 16) & 255;
      if (o < out.length && i + 2 < s.length) out[o++] = (t >> 8) & 255;
      if (o < out.length && i + 3 < s.length) out[o++] = t & 255;
    }
    return out.subarray(0, o);
  }

  // ---------------------------------------------------------------- the Recorder

  register('Recorder', {
    group: 'Output',
    help: 'The sound file. Its input is what you hear; its properties set the length and format.',
    inputs: [{ key: 'signal', label: 'Signal', default: 0, stereo: true }],
    props: [
      num('volume', 'Volume', 1),
      num('duration', 'Duration (s)', 1, { min: 0.01, max: 600 }),
      num('sampleRate', 'Samples/sec', 22050, { min: 4000, max: 192000, step: 1 }),
      { key: 'bits', label: 'Bits/sample', type: 'select', options: [8, 16], default: 16 },
      { key: 'stereo', label: 'Stereo', type: 'bool', default: false },
      { key: 'filename', label: 'File name', type: 'text', default: 'segway' }
    ],
    noOutput: true,
    stereoOutput: function (c) { return !!c.props.stereo; },
    render: function (ctx) {
      var v = ctx.props.volume;
      function scale(s) {
        var out = new Float32Array(ctx.n);
        for (var i = 0; i < ctx.n; i++) out[i] = s[i] * v;
        return out;
      }
      if (ctx.props.stereo) {
        var st = ctx.inputStereo('signal');
        return { left: scale(st.left), right: scale(st.right) };
      }
      return scale(ctx.input('signal'));
    }
  });

  return {
    // registry
    register: register,
    types: types,
    TYPES: TYPES,
    GROUPS: GROUPS,
    PROP_TYPES: PROP_TYPES,
    MAX_NESTING: MAX_NESTING,
    // helpers for modules
    frac: frac,
    clamp: clamp,
    curve: curve,
    CURVES: CURVES,
    sampleAt: sampleAt,
    mulberry32: mulberry32,
    num: num,
    OSC_INPUTS: OSC_INPUTS,
    oscillator: oscillator,
    isStereo: isStereo,
    toMono: toMono,
    toStereo: toStereo,
    deepCopy: deepCopy,
    bytesToBase64: bytesToBase64,
    base64ToBytes: base64ToBytes,
    // patches
    inputsOf: inputsOf,
    isStereoOutput: isStereoOutput,
    normalize: normalize,
    validate: validate,
    createPatch: createPatch,
    addComponent: addComponent,
    duplicateComponent: duplicateComponent,
    removeComponent: removeComponent,
    renameComponent: renameComponent,
    getComponent: getComponent,
    getRecorder: getRecorder,
    connect: connect,
    sourceOf: sourceOf,
    targetOf: targetOf,
    disconnectOutput: disconnectOutput,
    disconnectInput: disconnectInput,
    saveCustom: saveCustom,
    addCustom: addCustom,
    // rendering and files
    renderNode: renderNode,
    render: render,
    serialize: serialize,
    parse: parse,
    nestedPatch: nestedPatch
  };
});
