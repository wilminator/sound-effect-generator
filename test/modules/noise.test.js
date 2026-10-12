const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, single } = require('../helpers.js');

test('Noise is within ±Volume around Offset and repeatable', () => {
  const { p, c } = single('Noise', { volume: 0.5, offset: 1 });
  const a = E.renderNode(p, c.id, 1000, SR);
  const b = E.renderNode(p, c.id, 1000, SR);
  assert.deepEqual(a, b);
  for (const s of a) assert.ok(s >= 0.5 && s <= 1.5);
});

test('Noise uses its own seed: same seed, same sound; new seed, new sound', () => {
  const { p, c } = single('Noise', {}, { seed: 42 });
  const a = E.renderNode(p, c.id, 500, SR);
  const copy = E.parse(E.serialize(p));
  assert.deepEqual(E.renderNode(copy, c.id, 500, SR), a);
  c.props.seed = 43;
  assert.notDeepEqual(E.renderNode(p, c.id, 500, SR), a);
});

test('new Noise components get different seeds', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Noise');
  const b = E.addComponent(p, 'Noise');
  assert.ok(Number.isInteger(a.props.seed));
  assert.notEqual(a.props.seed, b.props.seed);
});
