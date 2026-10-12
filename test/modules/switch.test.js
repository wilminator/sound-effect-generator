const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, single } = require('../helpers.js');

test('Switch picks In floor(Select), clamped, and its inputs follow the channel count', () => {
  const { p, c } = single('Switch', {}, { channels: 3 });
  E.normalize(p);
  assert.deepEqual(E.inputsOf(c).map((i) => i.key), ['select', 'in0', 'in1', 'in2']);
  Object.assign(c.inputs, { in0: 10, in1: 20, in2: 30 });
  const at = (sel) => {
    c.inputs.select = sel;
    return E.renderNode(p, c.id, 1, SR)[0];
  };
  assert.equal(at(0), 10);
  assert.equal(at(1.9), 20);
  assert.equal(at(2), 30);
  assert.equal(at(7), 30);
  assert.equal(at(-3), 10);
  c.props.wrap = true;
  assert.equal(at(4), 20);
  assert.equal(at(-1), 30);
});

test('Switch switches as often as Select changes', () => {
  const p = E.createPatch();
  const gate = E.addComponent(p, 'Square');
  Object.assign(gate.inputs, { freq: 1000, volume: 0.5, offset: 0.5 }); // 0/1 every 4 samples
  const sw = E.addComponent(p, 'Switch');
  Object.assign(sw.inputs, { in0: -1, in1: 1 });
  E.connect(p, gate.id, sw.id, 'select');
  const out = E.renderNode(p, sw.id, SR, SR);
  let changes = 0;
  for (let i = 1; i < out.length; i++) if (out[i] !== out[i - 1]) changes++;
  assert.ok(changes >= 1990, 'only ' + changes + ' switches');
});

test('lowering the Switch input count drops connections to removed inputs', () => {
  const p = E.createPatch();
  const sw = E.addComponent(p, 'Switch');
  sw.props.channels = 4;
  E.normalize(p);
  const sine = E.addComponent(p, 'Sine');
  E.connect(p, sine.id, sw.id, 'in3');
  sw.props.channels = 2;
  E.normalize(p);
  assert.equal(p.connections.length, 0);
});
