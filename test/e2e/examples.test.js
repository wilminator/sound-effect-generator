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

test('every example peaks between 0.5 and 1, so none needs a volume hint', () => {
  for (const [name, build] of Object.entries(EXAMPLES)) {
    const r = E.render(build());
    assert.equal(r.suggestedVolume, null, name + ' peaks at ' + r.peak);
  }
});

test('the examples use every component group, including stereo', () => {
  const used = new Set();
  for (const build of Object.values(EXAMPLES)) for (const c of build().components) used.add(E.TYPES[c.type].group);
  for (const g of E.GROUPS) assert.ok(used.has(g), g);
});
