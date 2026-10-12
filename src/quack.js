/*
 * Node entry point: loads the engine and every module, and returns the engine.
 * The browser loads the same files with <script> tags in index.html; a test checks
 * that both lists match the files in src/modules/.
 */
'use strict';

var E = require('./core/engine.js');

var MODULES = [
  'sine', 'sawtooth', 'square', 'noise', 'patch',
  'mixer', 'modulator', 'merger', 'sequencer', 'music-modulator', 'switch', 'counter',
  'sweep', 'adsr',
  'comb-filter', 'echo', 'fuzz', 'moving-average'
];

MODULES.forEach(function (name) {
  require('./modules/' + name + '.js');
});

E.MODULES = MODULES;
module.exports = E;
