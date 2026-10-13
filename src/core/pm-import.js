/*
 * Imports patch maps (.pm) saved by the original Quack Sound Effects Studio.
 *
 * The format was worked out from patch files saved by users and from screenshots of the
 * same patches in the original program. A .pm file is an MFC CArchive stream (little-endian):
 *   u32 magic 0x67A28B22, u32 version 1
 *   repeat { u32 typeId (0 ends the list); object }        components
 *   repeat { u32 1 (0 ends the list); u16 srcRef; u32 srcPort; u16 dstRef; u32 dstPort }
 * Objects are written with MFC tags: 0xFFFF starts a new class (u16 schema, u16 name length,
 * name), and 0x8000|n reuses the class with index n. Classes and objects share one index
 * counter starting at 1, and connections refer to components by that index.
 * A component is: CString name (u8 length), i32 x, i32 y, a double per input, then any
 * class-specific fields. Components that aren't decoded yet stop the import, because their
 * size is unknown.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackPmImport = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAGIC = 0x67a28b22;
  var CURVES = ['Linear', 'Fast Start', 'Slow Start'];

  function Reader(bytes) {
    this.bytes = bytes;
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.p = 0;
    this.table = [null];
  }
  Reader.prototype.need = function (n) {
    if (this.p + n > this.bytes.length) throw new Error('The file ends early');
  };
  Reader.prototype.u8 = function () { this.need(1); return this.bytes[this.p++]; };
  Reader.prototype.u16 = function () { this.need(2); var v = this.view.getUint16(this.p, true); this.p += 2; return v; };
  Reader.prototype.u32 = function () { this.need(4); var v = this.view.getUint32(this.p, true); this.p += 4; return v; };
  Reader.prototype.i32 = function () { this.need(4); var v = this.view.getInt32(this.p, true); this.p += 4; return v; };
  Reader.prototype.f32 = function () { this.need(4); var v = this.view.getFloat32(this.p, true); this.p += 4; return v; };
  Reader.prototype.f64 = function () { this.need(8); var v = this.view.getFloat64(this.p, true); this.p += 8; return v; };
  Reader.prototype.text = function (n) {
    this.need(n);
    var s = '';
    for (var i = 0; i < n; i++) s += String.fromCharCode(this.bytes[this.p + i]);
    this.p += n;
    return s;
  };
  Reader.prototype.cstring = function () {
    var n = this.u8();
    if (n === 0xff) throw new Error('Long text fields are not supported');
    return this.text(n);
  };
  Reader.prototype.doubles = function (n) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(tidy(this.f64()));
    return out;
  };
  /** Reads an object tag and its class-specific body. */
  Reader.prototype.object = function () {
    var tag = this.u16();
    var cls;
    if (tag === 0xffff) {
      this.u16(); // schema
      cls = this.text(this.u16());
      this.table.push({ cls: cls });
    } else if (tag & 0x8000) {
      var entry = this.table[tag & 0x7fff];
      if (!entry || !entry.cls) throw new Error('Bad class reference in the file');
      cls = entry.cls;
    } else {
      throw new Error('Unexpected object reference in the file');
    }
    var obj = { cls: cls };
    this.table.push(obj);
    var layout = LAYOUTS[cls];
    if (!layout) {
      var e = new Error('Unsupported component: ' + (CLASS_NAMES[cls] || cls));
      e.unsupported = cls;
      throw e;
    }
    layout.read(this, obj);
    return obj;
  };

  /** Rounds values stored as single precision (0.850000024 → 0.85). */
  function tidy(x) {
    if (!isFinite(x) || x === 0) return x;
    var r = Number(x.toPrecision(7));
    return Math.abs(r - x) <= Math.abs(x) * 1e-7 ? r : x;
  }

  function bool(x) { return x !== 0; }

  /** A component layout: its input keys (in file order) plus extra fields. */
  function component(type, keys, extra, convert) {
    return {
      type: type,
      keys: keys,
      read: function (r, o) {
        o.name = r.cstring();
        o.x = r.i32();
        o.y = r.i32();
        o.values = r.doubles(keys.length);
        if (extra) extra(r, o);
      },
      convert: convert
    };
  }

  /** Stores each value under its key, as an input or (if listed in propKeys) a property. */
  function split(o, keys, propKeys) {
    var inputs = {};
    var props = {};
    keys.forEach(function (k, i) {
      if (propKeys && propKeys.indexOf(k) >= 0) props[k] = o.values[i];
      else inputs[k] = o.values[i];
    });
    return { inputs: inputs, props: props };
  }

  var OSC = ['freq', 'volume', 'phase', 'offset'];
  var LAYOUTS = {
    CSoundOutput: component('Recorder', ['signal'], function (r, o) { o.properties = r.object(); }, function (o) {
      var q = o.properties;
      var file = q.filename.replace(/^.*[\\/]/, '').replace(/\.wav$/i, '');
      return {
        inputs: { signal: o.values[0] },
        props: {
          volume: q.volume, duration: q.duration, sampleRate: q.rate,
          bits: q.bits16 ? 16 : 8, stereo: q.stereo, filename: file || 'segway'
        }
      };
    }),
    CqsProperties: {
      read: function (r, o) {
        o.samples = r.u32();
        r.u32();
        o.rate = r.u32();
        o.stereo = bool(r.u32());
        o.bits16 = bool(r.u32());
        o.duration = tidy(r.f64());
        o.volume = tidy(r.f64());
        o.filename = r.cstring();
        r.u32();
      }
    },
    CSoundSine: component('Sine', OSC),
    CSoundSquare: component('Square', ['freq', 'volume', 'ms', 'phase', 'offset']),
    CSoundSaw: component('Sawtooth', ['freq', 'volume', 'rf', 'phase', 'offset']),
    CSoundNoise: component('Noise', ['volume', 'offset']),
    CSoundModulator: component('Modulator', ['sigA', 'sigB']),
    CSoundSampleHold: component('Sample and Hold', ['signal', 'trigger']),
    CSoundMonoPan: component('Mono to Stereo Pan', ['signal', 'pan']),
    CSoundSweep: component('Sweep', ['signal', 'from', 'to'], null, function (o) {
      return split(o, ['signal', 'from', 'to'], ['from', 'to']);
    }),
    CSoundMixer: component('Mixer', ['sigA', 'sigB', 'sigC', 'sigD', 'volA', 'volB', 'volC', 'volD'], null, function (o) {
      return split(o, this.keys, ['volA', 'volB', 'volC', 'volD']);
    }),
    CSoundSequencer: component('Sequencer', ['sigA', 'sigB', 'sigC', 'sigD'], function (r, o) {
      o.slots = [];
      for (var i = 0; i < 4; i++) o.slots.push({ start: tidy(r.f64()), end: tidy(r.f64()), repeat: bool(r.u8()) });
    }, function (o) {
      var out = split(o, this.keys);
      ['A', 'B', 'C', 'D'].forEach(function (l, i) {
        out.props['start' + l] = o.slots[i].start;
        out.props['end' + l] = o.slots[i].end;
        out.props['repeat' + l] = o.slots[i].repeat;
      });
      return out;
    }),
    CSoundEcho: component('Echo', ['signal', 'delay', 'strength'], function (r, o) {
      o.maxDelay = tidy(r.f64());
      o.multiple = bool(r.u32());
    }, function (o) {
      var out = split(o, this.keys);
      out.props.maxDelay = o.maxDelay;
      out.props.multiple = o.multiple;
      return out;
    }),
    // The second of four flags is Symmetrical clip. The others (lower clip, upper clip and
    // force to zero, order unknown) were off in every file seen, so they are left at defaults.
    CSoundFuzz: component('Fuzz', ['signal', 'upper', 'lower'], function (r, o) {
      o.flags = [r.u32(), r.u32(), r.u32(), r.u32()];
    }, function (o) {
      var out = split(o, this.keys);
      out.props.symmetrical = bool(o.flags[1]);
      return out;
    }),
    CSoundAdsr: component('ADSR', ['signal', 'attack', 'peak', 'degree', 'decay', 'release', 'sustain', 'curve'], null, function (o) {
      var out = split(o, this.keys, ['attack', 'peak', 'degree', 'decay', 'release', 'sustain', 'curve']);
      out.props.curve = CURVES[out.props.curve] || 'Linear';
      return out;
    }),
    CSoundEnvelope: component('Envelope', ['signal'], function (r, o) {
      var n = r.u16();
      o.sections = [];
      for (var i = 0; i < n; i++) o.sections.push(r.object());
    }, function (o) {
      var out = split(o, this.keys);
      out.props.sections = o.sections.map(function (s) {
        return {
          start: s.start, sameAsPrevious: s.linked, end: s.end,
          duration: s.duration, curve: CURVES[s.curve] || 'Linear', degree: s.degree
        };
      });
      return out;
    }),
    CEnvSection: {
      read: function (r, o) {
        o.start = tidy(r.f64());
        o.end = tidy(r.f64());
        o.duration = tidy(r.f64());
        r.f64();
        o.degree = tidy(r.f32());
        o.linked = bool(r.u32());
        o.curve = r.u32();
      }
    }
  };

  // Friendly names for classes that may appear but aren't decoded yet.
  var CLASS_NAMES = {
    CSoundFourier: 'Fourier Wave', CSoundWav: 'WAV Sample', CSoundGranular: 'Granular Synth',
    CSoundMerger: 'Merger', CSoundMusicModulator: 'Music Modulator', CSoundComb: 'Comb Filter'
  };

  /**
   * Reads a .pm file (Uint8Array or ArrayBuffer) and returns { patch, warnings }, where patch
   * is in this app's saved-patch form, ready for QuackEngine.parse().
   */
  function importPm(data) {
    var bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    var r = new Reader(bytes);
    if (bytes.length < 8 || r.u32() !== MAGIC) throw new Error('Not a Quack patch map (.pm) file');
    var version = r.u32();
    if (version !== 1) throw new Error('Unsupported .pm version ' + version);

    var comps = [];
    while (r.u32() !== 0) {
      var obj;
      try {
        obj = r.object();
      } catch (e) {
        if (e.unsupported) {
          throw new Error('This patch uses a ' + (CLASS_NAMES[e.unsupported] || e.unsupported) +
            ' component, which the importer can\'t read yet');
        }
        throw e;
      }
      comps.push(obj);
    }

    var patch = { version: 1, nextId: comps.length + 1, components: [], connections: [] };
    var ids = new Map();
    comps.forEach(function (o, i) {
      var layout = LAYOUTS[o.cls];
      var v = layout.convert ? layout.convert.call(layout, o) : split(o, layout.keys);
      var id = 'c' + (i + 1);
      ids.set(o, id);
      patch.components.push({
        id: id, type: layout.type, name: o.name, x: o.x, y: o.y, inputs: v.inputs, props: v.props
      });
    });

    var warnings = [];
    while (r.u32() !== 0) {
      var from = r.table[r.u16() & 0x7fff];
      r.u32(); // source port: components have one output
      var to = r.table[r.u16() & 0x7fff];
      var port = r.u32();
      var toLayout = to && LAYOUTS[to.cls];
      if (!ids.has(from) || !ids.has(to) || !toLayout.keys || port >= toLayout.keys.length) {
        warnings.push('Skipped a connection the importer could not place');
        continue;
      }
      patch.connections.push({ from: ids.get(from), to: ids.get(to), input: toLayout.keys[port] });
    }
    return { patch: patch, warnings: warnings };
  }

  return { importPm: importPm };
});
