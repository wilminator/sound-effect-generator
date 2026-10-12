/* Patch-board UI. Rendering and patch rules live in engine.js. */
(function () {
  'use strict';

  var E = window.QuackEngine;
  var EXAMPLES = window.QuackExamples;
  var STORAGE_KEY = 'quack.patch';

  var patch = loadSaved() || EXAMPLES['Simple tone']();
  var selectedId = null;
  var lastRender = null;
  var audioCtx = null;

  var canvas = document.getElementById('canvas');
  var wires = document.getElementById('wires');
  var panel = document.getElementById('panel');
  var statusEl = document.getElementById('status');
  var playBtn = document.getElementById('play');
  var exportBtn = document.getElementById('export');
  var formatSelect = document.getElementById('format');

  // ------------------------------------------------------------ storage

  function loadSaved() {
    try {
      var text = localStorage.getItem(STORAGE_KEY);
      return text ? E.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  function autosave() {
    try { localStorage.setItem(STORAGE_KEY, E.serialize(patch)); } catch (e) { /* storage unavailable */ }
  }

  /** Call after any change to the patch. */
  function changed() {
    E.normalize(patch);
    lastRender = null;
    playBtn.disabled = true;
    exportBtn.disabled = true;
    autosave();
    drawBoard();
    drawPanel();
  }

  function setStatus(text, warn) {
    statusEl.textContent = text;
    statusEl.classList.toggle('warn', !!warn);
  }

  // ------------------------------------------------------------ toolbar

  var groups = {};
  Object.keys(E.TYPES).forEach(function (type) {
    var g = E.TYPES[type].group;
    if (g === 'Output') return;
    (groups[g] = groups[g] || []).push(type);
  });
  var toolbar = document.getElementById('toolbar');
  Object.keys(groups).forEach(function (g) {
    var wrap = document.createElement('div');
    wrap.className = 'group';
    var label = document.createElement('span');
    label.className = 'group-label';
    label.textContent = g;
    wrap.appendChild(label);
    groups[g].forEach(function (type) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = type;
      b.addEventListener('click', function () {
        var board = document.getElementById('board');
        var c = E.addComponent(patch, type, board.scrollLeft + 40 + Math.random() * 80, board.scrollTop + 40 + Math.random() * 80);
        selectedId = c.id;
        changed();
      });
      wrap.appendChild(b);
    });
    toolbar.appendChild(wrap);
  });

  var exampleSelect = document.getElementById('examples');
  var placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = 'Examples…';
  exampleSelect.appendChild(placeholder);
  Object.keys(EXAMPLES).forEach(function (name) {
    var o = document.createElement('option');
    o.value = name;
    o.textContent = name;
    exampleSelect.appendChild(o);
  });
  exampleSelect.addEventListener('change', function () {
    if (!exampleSelect.value) return;
    patch = EXAMPLES[exampleSelect.value]();
    exampleSelect.value = '';
    selectedId = null;
    changed();
    setStatus('');
  });

  // ------------------------------------------------------------ board

  function formatValue(v) {
    if (typeof v !== 'number') return String(v);
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
  }

  function drawBoard() {
    Array.prototype.slice.call(canvas.querySelectorAll('.node')).forEach(function (n) { n.remove(); });
    patch.components.forEach(function (c) {
      var def = E.TYPES[c.type];
      var node = document.createElement('div');
      node.className = 'node' + (c.id === selectedId ? ' selected' : '');
      node.dataset.id = c.id;
      node.style.left = c.x + 'px';
      node.style.top = c.y + 'px';

      var title = document.createElement('div');
      title.className = 'node-title';
      title.textContent = c.name;
      if (c.name.replace(/\d+$/, '') !== c.type.replace(/\s+/g, '')) {
        var t = document.createElement('span');
        t.className = 'node-type';
        t.textContent = c.type;
        title.appendChild(t);
      }
      if (!def.noOutput) {
        var out = document.createElement('span');
        out.className = 'dot out';
        out.dataset.out = c.id;
        out.title = 'Output';
        title.appendChild(out);
      }
      node.appendChild(title);

      E.inputsOf(c).forEach(function (input) {
        var row = document.createElement('div');
        row.className = 'in-row';
        var dot = document.createElement('span');
        dot.className = 'dot in';
        dot.dataset.to = c.id;
        dot.dataset.input = input.key;
        dot.title = input.label;
        var label = document.createElement('span');
        label.textContent = input.label;
        var val = document.createElement('span');
        val.className = 'val';
        var src = E.sourceOf(patch, c.id, input.key);
        val.textContent = src ? '' : formatValue(c.inputs[input.key]);
        row.appendChild(dot);
        row.appendChild(label);
        row.appendChild(val);
        node.appendChild(row);
      });

      title.addEventListener('pointerdown', startMove);
      node.addEventListener('pointerdown', function () {
        if (selectedId !== c.id) {
          selectedId = c.id;
          markSelected();
          drawPanel();
        }
      });
      canvas.appendChild(node);
    });
    drawWires();
  }

  function markSelected() {
    Array.prototype.forEach.call(canvas.querySelectorAll('.node'), function (n) {
      n.classList.toggle('selected', n.dataset.id === selectedId);
    });
  }

  function dotCenter(el) {
    var r = el.getBoundingClientRect();
    var base = canvas.getBoundingClientRect();
    return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
  }

  function wirePath(a, b) {
    var dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
  }

  function drawWires(temp) {
    var paths = patch.connections.map(function (k) {
      var outDot = canvas.querySelector('.dot.out[data-out="' + k.from + '"]');
      var inDot = canvas.querySelector('.dot.in[data-to="' + k.to + '"][data-input="' + k.input + '"]');
      if (!outDot || !inDot) return '';
      return '<path d="' + wirePath(dotCenter(outDot), dotCenter(inDot)) + '"/>';
    });
    if (temp) paths.push('<path class="temp" d="' + wirePath(temp.a, temp.b) + '"/>');
    wires.innerHTML = paths.join('');
  }

  // Dragging a component by its title bar.
  function startMove(e) {
    if (e.target.classList.contains('dot')) return;
    var title = e.currentTarget;
    var node = title.parentNode;
    var c = E.getComponent(patch, node.dataset.id);
    var startX = e.clientX;
    var startY = e.clientY;
    var origX = c.x;
    var origY = c.y;
    title.setPointerCapture(e.pointerId);
    function move(ev) {
      c.x = Math.max(0, origX + ev.clientX - startX);
      c.y = Math.max(0, origY + ev.clientY - startY);
      node.style.left = c.x + 'px';
      node.style.top = c.y + 'px';
      drawWires();
    }
    function up() {
      title.removeEventListener('pointermove', move);
      title.removeEventListener('pointerup', up);
      autosave();
    }
    title.addEventListener('pointermove', move);
    title.addEventListener('pointerup', up);
  }

  // Dragging a connection from an output to an input, or from an input to an output.
  canvas.addEventListener('pointerdown', function (e) {
    var dot = e.target;
    if (!dot.classList || !dot.classList.contains('dot')) return;
    e.preventDefault();
    e.stopPropagation();
    var fromOutput = dot.classList.contains('out');
    var anchor = dotCenter(dot);
    var base = canvas.getBoundingClientRect();
    dot.setPointerCapture(e.pointerId);

    function move(ev) {
      var p = { x: ev.clientX - base.left, y: ev.clientY - base.top };
      drawWires(fromOutput ? { a: anchor, b: p } : { a: p, b: anchor });
    }
    function up(ev) {
      dot.removeEventListener('pointermove', move);
      dot.removeEventListener('pointerup', up);
      var target = document.elementFromPoint(ev.clientX, ev.clientY);
      var outDot = fromOutput ? dot : target;
      var inDot = fromOutput ? target : dot;
      if (outDot && inDot && outDot.dataset && inDot.dataset && outDot.dataset.out && inDot.dataset.to) {
        try {
          E.connect(patch, outDot.dataset.out, inDot.dataset.to, inDot.dataset.input);
          changed();
          return;
        } catch (err) {
          setStatus(err.message, true);
        }
      }
      drawWires();
    }
    dot.addEventListener('pointermove', move);
    dot.addEventListener('pointerup', up);
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (e.target === canvas || e.target === wires) {
      selectedId = null;
      markSelected();
      drawPanel();
    }
  });

  // ------------------------------------------------------------ side panel

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function row(labelText, control) {
    var r = el('div', { class: 'row' });
    var id = 'f-' + Math.random().toString(36).slice(2);
    control.id = id;
    r.appendChild(el('label', { for: id }, labelText));
    r.appendChild(control);
    return r;
  }

  function numberField(value, onChange) {
    var input = el('input', { type: 'number', step: 'any' });
    input.value = value;
    input.addEventListener('change', function () {
      var v = Number(input.value);
      if (isFinite(v)) onChange(v);
    });
    return input;
  }

  function drawPanel() {
    panel.innerHTML = '';
    var c = selectedId && E.getComponent(patch, selectedId);
    if (!c) {
      panel.appendChild(el('p', { class: 'hint' }, 'Select a component to edit it.'));
      return;
    }
    var def = E.TYPES[c.type];
    panel.appendChild(el('h2', {}, c.type));

    var name = el('input', { type: 'text' });
    name.value = c.name;
    name.addEventListener('change', function () {
      if (name.value.trim()) c.name = name.value.trim();
      changed();
    });
    panel.appendChild(row('Name', name));

    var inputs = E.inputsOf(c);
    if (inputs.length) {
      panel.appendChild(el('h3', {}, 'Inputs'));
      inputs.forEach(function (input) {
        var src = E.sourceOf(patch, c.id, input.key);
        if (src) {
          var r = el('div', { class: 'row' });
          r.appendChild(el('label', {}, input.label));
          r.appendChild(el('span', { class: 'from' }, 'from ' + E.getComponent(patch, src.from).name));
          var b = el('button', { type: 'button' }, 'Disconnect');
          b.addEventListener('click', function () {
            E.disconnectInput(patch, c.id, input.key);
            changed();
          });
          r.appendChild(b);
          panel.appendChild(r);
        } else {
          panel.appendChild(row(input.label, numberField(c.inputs[input.key], function (v) {
            c.inputs[input.key] = v;
            changed();
          })));
        }
      });
    }

    if (def.props.length) {
      panel.appendChild(el('h3', {}, 'Properties'));
      def.props.forEach(function (p) {
        var control;
        if (p.type === 'patch') {
          panel.appendChild(patchFileRow(c, p));
          return;
        }
        if (p.type === 'select') {
          control = el('select');
          p.options.forEach(function (o) {
            var opt = el('option', { value: String(o) }, String(o));
            if (String(o) === String(c.props[p.key])) opt.selected = true;
            control.appendChild(opt);
          });
          control.addEventListener('change', function () {
            c.props[p.key] = typeof p.default === 'number' ? Number(control.value) : control.value;
            changed();
          });
        } else if (p.type === 'bool') {
          control = el('input', { type: 'checkbox' });
          control.checked = !!c.props[p.key];
          control.addEventListener('change', function () {
            c.props[p.key] = control.checked;
            changed();
          });
        } else {
          control = numberField(c.props[p.key], function (v) {
            if (p.min !== undefined) v = Math.max(p.min, v);
            if (p.max !== undefined) v = Math.min(p.max, v);
            c.props[p.key] = p.step === 1 ? Math.round(v) : v;
            changed();
          });
        }
        panel.appendChild(row(p.label, control));
      });
    }

    var actions = el('div', { class: 'actions' });
    if (!def.noOutput) {
      var disc = el('button', { type: 'button' }, 'Disconnect output');
      disc.addEventListener('click', function () {
        E.disconnectOutput(patch, c.id);
        changed();
      });
      actions.appendChild(disc);
    }
    if (c.type !== 'Recorder') {
      var dup = el('button', { type: 'button' }, 'Duplicate');
      dup.addEventListener('click', function () {
        var copy = E.addComponent(patch, c.type, c.x + 30, c.y + 30);
        copy.inputs = JSON.parse(JSON.stringify(c.inputs));
        copy.props = JSON.parse(JSON.stringify(c.props));
        selectedId = copy.id;
        changed();
      });
      actions.appendChild(dup);
      var del = el('button', { type: 'button' }, 'Delete');
      del.addEventListener('click', deleteSelected);
      actions.appendChild(del);
    }
    panel.appendChild(actions);
  }

  /** Loads a saved patch file into a Patch component, which stores a copy of it. */
  function patchFileRow(c, p) {
    var r = el('div', { class: 'row' });
    r.appendChild(el('label', {}, p.label));
    r.appendChild(el('span', { class: 'from' }, c.props.patch ? (c.props.file || 'loaded') : 'none'));
    var picker = el('input', { type: 'file', accept: '.json,application/json', hidden: '' });
    var b = el('button', { type: 'button' }, 'Load…');
    b.addEventListener('click', function () { picker.click(); });
    picker.addEventListener('change', function () {
      var f = picker.files[0];
      if (!f) return;
      f.text().then(function (text) {
        var data = JSON.parse(text);
        E.parse(data); // validate before storing
        c.props.patch = data;
        c.props.file = f.name;
        changed();
      }).catch(function (err) {
        setStatus('Could not load ' + f.name + ': ' + err.message, true);
      });
    });
    r.appendChild(b);
    r.appendChild(picker);
    return r;
  }

  function deleteSelected() {
    var c = selectedId && E.getComponent(patch, selectedId);
    if (!c || c.type === 'Recorder') return;
    E.removeComponent(patch, c.id);
    selectedId = null;
    changed();
  }

  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      deleteSelected();
    }
  });

  // ------------------------------------------------------------ sound

  function create() {
    try {
      var t0 = performance.now();
      lastRender = E.render(patch);
      var ms = Math.round(performance.now() - t0);
      var msg = 'Peak ' + lastRender.peak.toFixed(3) + ' (' + ms + ' ms)';
      if (lastRender.peak === 0) {
        setStatus(msg + '. The sound is silent.', true);
      } else if (lastRender.suggestedVolume !== null) {
        setStatus(msg + '. Try Recorder volume ' + lastRender.suggestedVolume + '.', true);
      } else {
        setStatus(msg);
      }
      playBtn.disabled = false;
      exportBtn.disabled = false;
      drawScope(lastRender.samples);
      return true;
    } catch (err) {
      setStatus('Could not create the sound: ' + err.message, true);
      return false;
    }
  }

  function play() {
    if (!lastRender) return;
    // Created on first use: browsers only allow audio after a user gesture.
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var buffer = audioCtx.createBuffer(1, lastRender.samples.length, lastRender.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, lastRender.samples[i]));
    var node = audioCtx.createBufferSource();
    node.buffer = buffer;
    node.connect(audioCtx.destination);
    node.start();
  }

  function drawScope(samples) {
    var scope = document.getElementById('scope');
    var g = scope.getContext('2d');
    var w = scope.width;
    var h = scope.height;
    var style = getComputedStyle(document.documentElement);
    g.clearRect(0, 0, w, h);
    g.strokeStyle = style.getPropertyValue('--border');
    g.beginPath();
    g.moveTo(0, h / 2);
    g.lineTo(w, h / 2);
    g.stroke();
    g.strokeStyle = style.getPropertyValue('--accent');
    g.beginPath();
    var per = samples.length / w;
    for (var x = 0; x < w; x++) {
      var lo = 1;
      var hi = -1;
      for (var i = Math.floor(x * per); i < Math.floor((x + 1) * per) || i === Math.floor(x * per); i++) {
        var s = samples[i] || 0;
        if (s < lo) lo = s;
        if (s > hi) hi = s;
      }
      g.moveTo(x + 0.5, (1 - Math.min(1, hi)) * h / 2);
      g.lineTo(x + 0.5, (1 - Math.max(-1, lo)) * h / 2 + 1);
    }
    g.stroke();
  }

  function downloadBlob(data, type, filename) {
    var url = URL.createObjectURL(new Blob([data], { type: type }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  document.getElementById('create-play').addEventListener('click', function () {
    if (create()) play();
  });
  playBtn.addEventListener('click', play);
  // ------------------------------------------------------------ export

  var MP3_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
  var MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
  var OGG_TYPE = 'audio/ogg;codecs=opus';
  var oggSupported = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(OGG_TYPE);

  if (!oggSupported) {
    var oggOption = formatSelect.querySelector('option[value="ogg"]');
    oggOption.disabled = true;
    oggOption.textContent += ' (not supported in this browser)';
  }

  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('could not load the MP3 encoder (are you offline?)')); };
      document.head.appendChild(s);
    });
  }

  function toInt16(samples) {
    var out = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function encodeMp3(r) {
    if (MP3_RATES.indexOf(r.sampleRate) < 0) {
      return Promise.reject(new Error('MP3 needs one of these sample rates: ' + MP3_RATES.join(', ')));
    }
    var ready = window.lamejs ? Promise.resolve() : loadScript(MP3_URL);
    return ready.then(function () {
      var enc = new window.lamejs.Mp3Encoder(1, r.sampleRate, 128);
      var pcm = toInt16(r.samples);
      var chunks = [];
      for (var i = 0; i < pcm.length; i += 1152) {
        var buf = enc.encodeBuffer(pcm.subarray(i, i + 1152));
        if (buf.length) chunks.push(new Uint8Array(buf));
      }
      var end = enc.flush();
      if (end.length) chunks.push(new Uint8Array(end));
      return new Blob(chunks, { type: 'audio/mpeg' });
    });
  }

  // The browser's own Ogg Opus encoder only records in real time, so this plays the
  // sound silently into a recorder and takes as long as the sound itself.
  function encodeOgg(r) {
    var ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    var buffer = ctx.createBuffer(1, r.samples.length, r.sampleRate);
    buffer.getChannelData(0).set(r.samples);
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    var rec = new MediaRecorder(dest.stream, { mimeType: OGG_TYPE });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    return new Promise(function (resolve) {
      rec.onstop = function () {
        ctx.close();
        resolve(new Blob(chunks, { type: 'audio/ogg' }));
      };
      src.onended = function () { setTimeout(function () { rec.stop(); }, 100); };
      rec.start();
      src.start();
    });
  }

  exportBtn.addEventListener('click', function () {
    var r = lastRender;
    if (!r) return;
    var format = formatSelect.value;
    var job;
    if (format === 'wav') job = Promise.resolve(new Blob([E.encodeWav(r.samples, r.sampleRate, r.bits)], { type: 'audio/wav' }));
    else if (format === 'flac') job = Promise.resolve(new Blob([window.QuackFlac.encodeFlac(r.samples, r.sampleRate, r.bits)], { type: 'audio/flac' }));
    else if (format === 'mp3') job = encodeMp3(r);
    else job = encodeOgg(r);
    exportBtn.disabled = true;
    setStatus('Exporting ' + format.toUpperCase() + '…');
    job.then(function (blob) {
      downloadBlob(blob, blob.type, 'quack.' + format);
      setStatus('Exported quack.' + format);
    }).catch(function (err) {
      setStatus('Could not export ' + format.toUpperCase() + ': ' + err.message, true);
    }).then(function () {
      exportBtn.disabled = !lastRender;
    });
  });

  // ------------------------------------------------------------ files

  document.getElementById('new').addEventListener('click', function () {
    patch = E.createPatch();
    selectedId = null;
    changed();
    setStatus('');
  });
  document.getElementById('save').addEventListener('click', function () {
    downloadBlob(E.serialize(patch), 'application/json', 'patch.json');
  });
  var fileInput = document.getElementById('file');
  document.getElementById('open').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (!f) return;
    f.text().then(function (text) {
      patch = E.parse(text);
      selectedId = null;
      changed();
      setStatus('Opened ' + f.name);
    }).catch(function (err) {
      setStatus('Could not open ' + f.name + ': ' + err.message, true);
    });
    fileInput.value = '';
  });

  window.addEventListener('resize', function () { drawWires(); });
  drawBoard();
  drawPanel();
})();
