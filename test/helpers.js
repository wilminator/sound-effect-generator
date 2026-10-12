// Shared helpers for the unit and end-to-end tests.
const E = require('../src/quack.js');

const SR = 8000;

function close(a, b, eps = 1e-5) {
  return Math.abs(a - b) <= eps;
}

function peak(samples) {
  let p = 0;
  for (const s of samples) p = Math.max(p, Math.abs(s));
  return p;
}

/** A patch with one component of `type` and the given inputs and props. */
function single(type, inputs = {}, props = {}) {
  const p = E.createPatch();
  const c = E.addComponent(p, type);
  Object.assign(c.props, props);
  E.normalize(p);
  Object.assign(c.inputs, inputs);
  return { p, c };
}

/** Adds a Sequencer that outputs a single 1-sample impulse of `height` at t = 0. */
function impulse(p, height = 1) {
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.inputs, { sigA: height });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR, repeatA: false });
  return seq;
}

module.exports = { E, SR, close, peak, single, impulse };
