const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close } = require('../helpers.js');

test('Fuzz clips between Lower and Upper', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 100 });
  const fuzz = E.addComponent(p, 'Fuzz');
  Object.assign(fuzz.inputs, { upper: 0.5, lower: -0.25 });
  E.connect(p, sine.id, fuzz.id, 'signal');
  let out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(Math.max(...out) <= 0.5 && Math.min(...out) >= -0.25);
  assert.ok(close(Math.max(...out), 0.5) && close(Math.min(...out), -0.25));

  fuzz.props.symmetrical = true;
  out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(close(Math.min(...out), -0.5));

  fuzz.props.symmetrical = false;
  fuzz.props.forceZero = true;
  out = E.renderNode(p, fuzz.id, 160, SR);
  assert.ok(close(Math.min(...out), 0) && close(Math.max(...out), 0.75));
});
