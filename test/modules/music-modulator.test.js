const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('Music Modulator gives A=440 Hz in octave 5 and shifts by semitones', () => {
  const { p, c } = single('Music Modulator', { signal: 0 }, { note: 'A', octave: 5 });
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 440, 1e-3));
  c.inputs.signal = 12;
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 880, 1e-3));
  c.inputs.signal = 0;
  c.props.note = 'C';
  assert.ok(close(E.renderNode(p, c.id, 1, SR)[0], 261.6256, 1e-3));
});
