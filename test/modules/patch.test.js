const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, peak, single } = require('../helpers.js');

/** A patch whose Recorder plays a 440 Hz sine at volume 0.8. */
function simpleTone() {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  Object.assign(sine.inputs, { freq: 440, volume: 0.8 });
  E.connect(p, sine.id, E.getRecorder(p).id, 'signal');
  return p;
}

test('Patch plays a nested patch at the outer length and sample rate', () => {
  const inner = simpleTone();
  const p = E.createPatch();
  const nested = E.addComponent(p, 'Patch');
  nested.props.patch = JSON.parse(E.serialize(inner));
  nested.inputs.volume = 0.5;
  const out = E.renderNode(p, nested.id, 4000, SR);
  assert.equal(out.length, 4000);
  const direct = E.renderNode(inner, E.getRecorder(inner).id, 4000, SR);
  assert.ok(close(out[123], direct[123] * 0.5));
});

test('an empty Patch is silent, and patches nest inside patches', () => {
  const { p, c } = single('Patch');
  assert.equal(peak(E.renderNode(p, c.id, 100, SR)), 0);

  const level1 = E.parse(E.serialize(p));
  E.getComponent(level1, c.id).props.patch = JSON.parse(E.serialize(simpleTone()));
  E.connect(level1, c.id, E.getRecorder(level1).id, 'signal');
  const outer = E.createPatch();
  const wrap = E.addComponent(outer, 'Patch');
  wrap.props.patch = JSON.parse(E.serialize(level1));
  assert.ok(peak(E.renderNode(outer, wrap.id, 400, SR)) > 0.5);
});
