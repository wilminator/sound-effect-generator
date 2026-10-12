/*
 * Node entry point: loads the engine and every module, and returns the engine.
 * The browser loads the same files with <script> tags in index.html; a test checks
 * that both lists match the files in src/modules/.
 */
'use strict';

var E = require('./core/engine.js');

var MODULES = [
  'sine', 'sawtooth', 'square', 'noise', 'fourier-wave', 'wav-sample', 'granular-synth', 'math-function', 'wave-function', 'patch',
  'mixer', 'modulator', 'merger', 'sequencer', 'music-modulator', 'sample-hold', 'switch', 'counter',
  'sweep', 'adsr', 'envelope',
  'comb-filter', 'echo', 'fuzz', 'moving-average', 'filter',
  'mono-stereo-splitter', 'mono-stereo-pan', 'stereo-mono-merger', 'stereo-mono-pan', 'stereo-cross'
];

MODULES.forEach(function (name) {
  require('./modules/' + name + '.js');
});

E.MODULES = MODULES;
module.exports = E;
