/* UI wiring for the quack generator. Synthesis lives in quack.js. */
(function () {
  'use strict';

  var Q = window.Quack;
  var params = Q.clampParams(Q.PRESETS['Mallard']);
  var audioCtx = null;
  var inputs = {};

  var form = document.getElementById('controls');
  var presetSelect = document.getElementById('preset');

  function format(spec, v) {
    var s = spec.step < 1 ? v.toFixed(2) : String(v);
    return spec.unit ? s + ' ' + spec.unit : s;
  }

  Q.PARAM_SPECS.forEach(function (spec) {
    var label = document.createElement('label');
    label.htmlFor = 'p-' + spec.key;
    label.textContent = spec.label;

    var input = document.createElement('input');
    input.type = 'range';
    input.id = 'p-' + spec.key;
    input.min = spec.min;
    input.max = spec.max;
    input.step = spec.step;

    var out = document.createElement('output');
    out.htmlFor = input.id;

    input.addEventListener('input', function () {
      params[spec.key] = Number(input.value);
      out.textContent = format(spec, params[spec.key]);
      presetSelect.value = '';
    });
    input.addEventListener('change', play);

    form.appendChild(label);
    form.appendChild(input);
    form.appendChild(out);
    inputs[spec.key] = { input: input, out: out, spec: spec };
  });

  var custom = document.createElement('option');
  custom.value = '';
  custom.textContent = 'Custom';
  presetSelect.appendChild(custom);
  Object.keys(Q.PRESETS).forEach(function (name) {
    var opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    presetSelect.appendChild(opt);
  });
  presetSelect.value = 'Mallard';

  function syncInputs() {
    Object.keys(inputs).forEach(function (key) {
      var it = inputs[key];
      it.input.value = params[key];
      it.out.textContent = format(it.spec, params[key]);
    });
  }

  function play() {
    // Created on first use: browsers only allow audio after a user gesture.
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    var samples = Q.render(params, audioCtx.sampleRate, { seed: Date.now() });
    var buffer = audioCtx.createBuffer(1, samples.length, audioCtx.sampleRate);
    buffer.getChannelData(0).set(samples);
    var node = audioCtx.createBufferSource();
    node.buffer = buffer;
    node.connect(audioCtx.destination);
    node.start();
  }

  function download() {
    var rate = 44100;
    var wav = Q.encodeWav(Q.render(params, rate), rate);
    var url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
    var a = document.createElement('a');
    a.href = url;
    a.download = (presetSelect.value || 'quack').toLowerCase().replace(/\s+/g, '-') + '.wav';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  presetSelect.addEventListener('change', function () {
    if (!presetSelect.value) return;
    params = Q.clampParams(Q.PRESETS[presetSelect.value]);
    syncInputs();
    play();
  });

  document.getElementById('quack').addEventListener('click', play);
  document.getElementById('download').addEventListener('click', download);
  document.getElementById('random').addEventListener('click', function () {
    params = Q.randomParams();
    presetSelect.value = '';
    syncInputs();
    play();
  });

  document.addEventListener('keydown', function (e) {
    var tag = e.target.tagName;
    if (e.repeat || tag === 'SELECT' || tag === 'BUTTON') return;
    if (e.code === 'Space' || e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      play();
    }
  });

  syncInputs();
})();
