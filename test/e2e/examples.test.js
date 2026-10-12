const test = require('node:test');
const assert = require('node:assert/strict');
const { E } = require('../helpers.js');
const EXAMPLES = require('../../src/examples.js');

test('every example renders finite, non-silent audio', () => {
  for (const [name, build] of Object.entries(EXAMPLES)) {
    const r = E.render(build());
    assert.ok(r.channels.every((ch) => ch.every(Number.isFinite)), name + ' has non-finite samples');
    assert.ok(r.peak > 0.05, name + ' is silent');
  }
});

test('a saved patch keeps nested patches and Switch inputs', () => {
  const p = EXAMPLES['Arpeggio']();
  const nest = E.addComponent(p, 'Patch');
  nest.props.patch = JSON.parse(E.serialize(EXAMPLES['Siren']()));
  const q = E.parse(E.serialize(p));
  assert.deepEqual(q.components, p.components);
  assert.deepEqual(q.connections, p.connections);
});
