const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, impulse } = require('../helpers.js');

test('Echo repeats with feedback only when Repeating is on', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR, repeatA: false });
  const echo = E.addComponent(p, 'Echo');
  Object.assign(echo.inputs, { delay: 0.01, strength: 0.5 });
  E.connect(p, seq.id, echo.id, 'signal');

  const single = E.renderNode(p, echo.id, 300, SR);
  assert.ok(close(single[80], 0.5));
  assert.ok(close(single[160], 0));

  echo.props.multiple = true;
  const multi = E.renderNode(p, echo.id, 300, SR);
  assert.ok(close(multi[80], 0.5));
  assert.ok(close(multi[160], 0.25));
});

test('Echo delay is capped at Max Delay', () => {
  const p = E.createPatch();
  const seq = E.addComponent(p, 'Sequencer');
  Object.assign(seq.inputs, { sigA: 1 });
  Object.assign(seq.props, { startA: 0, endA: 1 / SR });
  const echo = E.addComponent(p, 'Echo');
  Object.assign(echo.inputs, { delay: 1, strength: 1 });
  echo.props.maxDelay = 0.01;
  E.connect(p, seq.id, echo.id, 'signal');
  assert.ok(close(E.renderNode(p, echo.id, 200, SR)[80], 1));
});
