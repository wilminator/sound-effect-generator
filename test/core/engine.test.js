const test = require('node:test');
const assert = require('node:assert/strict');
const { E, SR, close, single } = require('../helpers.js');

test('a new patch has exactly one Recorder', () => {
  const p = E.createPatch();
  assert.equal(p.components.length, 1);
  assert.equal(E.getRecorder(p).type, 'Recorder');
  assert.throws(() => E.addComponent(p, 'Recorder'));
  assert.throws(() => E.removeComponent(p, E.getRecorder(p).id));
});

test('components get default names like Sine1, Sine2', () => {
  const p = E.createPatch();
  assert.equal(E.addComponent(p, 'Sine').name, 'Sine1');
  assert.equal(E.addComponent(p, 'Sine').name, 'Sine2');
  assert.equal(E.addComponent(p, 'Comb Filter').name, 'CombFilter1');
});

test('an output feeds one input: a new connection replaces the old one', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  const mixer = E.addComponent(p, 'Mixer');
  E.connect(p, sine.id, mixer.id, 'sigA');
  E.connect(p, sine.id, mixer.id, 'sigB');
  assert.equal(p.connections.length, 1);
  assert.equal(p.connections[0].input, 'sigB');
});

test('an input has one source: a new connection replaces the old one', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  const b = E.addComponent(p, 'Square');
  const rec = E.getRecorder(p);
  E.connect(p, a.id, rec.id, 'signal');
  E.connect(p, b.id, rec.id, 'signal');
  assert.equal(p.connections.length, 1);
  assert.equal(E.sourceOf(p, rec.id, 'signal').from, b.id);
});

test('invalid connections are rejected', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sweep');
  const b = E.addComponent(p, 'Sweep');
  const rec = E.getRecorder(p);
  assert.throws(() => E.connect(p, a.id, a.id, 'signal'), /itself/);
  assert.throws(() => E.connect(p, rec.id, a.id, 'signal'), /no output/);
  assert.throws(() => E.connect(p, a.id, b.id, 'nope'), /no input/);
  E.connect(p, a.id, b.id, 'signal');
  assert.throws(() => E.connect(p, b.id, a.id, 'signal'), /loop/);
});

test('removing a component removes its connections', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  E.connect(p, a.id, E.getRecorder(p).id, 'signal');
  E.removeComponent(p, a.id);
  assert.equal(p.connections.length, 0);
});

test('disconnectOutput and disconnectInput remove the connection', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  const rec = E.getRecorder(p);
  E.connect(p, a.id, rec.id, 'signal');
  E.disconnectOutput(p, a.id);
  assert.equal(p.connections.length, 0);
  E.connect(p, a.id, rec.id, 'signal');
  E.disconnectInput(p, rec.id, 'signal');
  assert.equal(p.connections.length, 0);
});

test('render uses the Recorder duration, sample rate and volume', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { duration: 0.5, sampleRate: 11025, volume: 0.7 });
  const sine = E.addComponent(p, 'Sine');
  E.connect(p, sine.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.sampleRate, 11025);
  assert.equal(r.channels[0].length, Math.round(0.5 * 11025));
  assert.ok(close(r.peak, 0.7, 1e-3));
  assert.equal(r.suggestedVolume, null);
});

test('render suggests a volume when the peak is outside 0.5–1', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  sine.inputs.volume = 4;
  E.connect(p, sine.id, E.getRecorder(p).id, 'signal');
  const r = E.render(p);
  assert.ok(r.peak > 1);
  assert.ok(close(r.suggestedVolume, 0.225, 1e-3));
});

test('an empty patch renders silence', () => {
  const r = E.render(E.createPatch());
  assert.equal(r.peak, 0);
  assert.equal(r.suggestedVolume, null);
});

test('serialize and parse round-trip a patch', () => {
  const p = E.createPatch();
  const noise = E.addComponent(p, 'Noise');
  const env = E.addComponent(p, 'ADSR');
  E.connect(p, noise.id, env.id, 'signal');
  E.connect(p, env.id, E.getRecorder(p).id, 'signal');
  const q = E.parse(E.serialize(p));
  assert.deepEqual(q.components, p.components);
  assert.deepEqual(q.connections, p.connections);
  assert.deepEqual(E.render(q).channels, E.render(p).channels);
  // New components after loading get fresh ids.
  const added = E.addComponent(q, 'Sine');
  assert.ok(!p.components.some((c) => c.id === added.id));
});

test('parse rejects bad files and fills missing defaults', () => {
  assert.throws(() => E.parse('{}'));
  assert.throws(() => E.parse({ components: [{ id: 'c1', type: 'Bogus' }] }));
  assert.throws(() => E.parse({ components: [] }), /Recorder/);
  const q = E.parse({ components: [{ id: 'c1', type: 'Recorder' }, { id: 'c2', type: 'Sine' }] });
  assert.equal(E.getComponent(q, 'c2').inputs.freq, 400);
});

test('envelope curves start at 0 and end at 1', () => {
  for (const type of E.CURVES) {
    assert.ok(close(E.curve(type, 3, 0), 0), type);
    assert.ok(close(E.curve(type, 3, 1), 1), type);
  }
  assert.ok(E.curve('Slow Start', 3, 0.5) < 0.5);
  assert.ok(E.curve('Fast Start', 3, 0.5) > 0.5);
});

// ---------------------------------------------------------------- registry

test('register rejects duplicates, missing render functions and unknown property types', () => {
  assert.throws(() => E.register('Sine', { render() {} }), /already/);
  assert.throws(() => E.register('NoRender', {}), /render/);
  assert.throws(() => E.register('BadProp', { props: [{ key: 'x', type: 'colour' }], render() {} }), /unknown property type/);
});

test('every module is in the Node module list and in index.html, in the same order', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..', '..');
  const files = fs.readdirSync(path.join(root, 'src', 'modules')).filter((f) => f.endsWith('.js')).map((f) => f.slice(0, -3)).sort();
  assert.deepEqual([...E.MODULES].sort(), files);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const tags = [...html.matchAll(/src="src\/modules\/([a-z0-9-]+)\.js"/g)].map((m) => m[1]);
  assert.deepEqual(tags, E.MODULES);
});

test('every registered type has a group, help text and valid defaults', () => {
  for (const type of E.types()) {
    const def = E.TYPES[type];
    assert.ok(type === 'Recorder' || E.GROUPS.includes(def.group), type + ' group');
    assert.ok(typeof def.help === 'string' && def.help.length > 0, type + ' help');
    if (type === 'Recorder') continue;
    const { p, c } = single(type);
    assert.ok(E.inputsOf(c).every((i) => typeof c.inputs[i.key] === 'number'), type + ' input defaults');
    const out = E.renderNode(p, c.id, 64, SR);
    const chans = E.isStereo(out) ? [out.left, out.right] : [out];
    assert.ok(chans.every((ch) => ch.length === 64 && ch.every(Number.isFinite)), type + ' renders 64 finite samples');
  }
});

// ---------------------------------------------------------------- stereo plumbing

test('a stereo Recorder duplicates a mono signal into both channels', () => {
  const p = E.createPatch();
  const rec = E.getRecorder(p);
  Object.assign(rec.props, { stereo: true, duration: 0.01, sampleRate: SR });
  const sine = E.addComponent(p, 'Sine');
  E.connect(p, sine.id, rec.id, 'signal');
  const r = E.render(p);
  assert.equal(r.channels.length, 2);
  assert.deepEqual(r.channels[0], r.channels[1]);
});

test('toMono averages a stereo pair and toStereo duplicates mono', () => {
  const left = new Float32Array([1, 0]);
  const right = new Float32Array([0, 1]);
  assert.deepEqual(E.toMono({ left, right }), new Float32Array([0.5, 0.5]));
  const mono = new Float32Array([0.25]);
  assert.deepEqual(E.toStereo(mono), { left: mono, right: mono });
  assert.equal(E.isStereo(mono), false);
  assert.equal(E.isStereo({ left, right }), true);
});

// ---------------------------------------------------------------- editing helpers

test('duplicateComponent copies inputs and properties but not connections', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'ADSR');
  a.props.attack = 0.5;
  a.inputs.signal = 0.3;
  E.connect(p, a.id, E.getRecorder(p).id, 'signal');
  const b = E.duplicateComponent(p, a.id);
  assert.notEqual(b.id, a.id);
  assert.equal(b.props.attack, 0.5);
  assert.equal(b.inputs.signal, 0.3);
  assert.equal(E.targetOf(p, b.id), null);
  b.props.attack = 1;
  assert.equal(a.props.attack, 0.5);
});

test('renameComponent trims and ignores empty names', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Sine');
  E.renameComponent(p, a.id, '  Lead  ');
  assert.equal(a.name, 'Lead');
  E.renameComponent(p, a.id, '   ');
  assert.equal(a.name, 'Lead');
});

test('custom components save inputs and properties as new defaults', () => {
  const p = E.createPatch();
  const a = E.addComponent(p, 'Switch');
  a.props.channels = 5;
  E.normalize(p);
  a.inputs.in4 = 0.75;
  E.renameComponent(p, a.id, 'Picker');
  const ccf = JSON.parse(JSON.stringify(E.saveCustom(a)));
  const q = E.createPatch();
  const b = E.addCustom(q, ccf, 10, 20);
  assert.equal(b.type, 'Switch');
  assert.equal(b.props.channels, 5);
  assert.equal(b.inputs.in4, 0.75);
  assert.equal(b.name, 'Picker1');
  assert.equal(E.addCustom(q, ccf).name, 'Picker2');
  assert.throws(() => E.addCustom(q, { type: 'Sine' }), /custom component/);
});

test('render taps record the output of every component for scopes', () => {
  const p = E.createPatch();
  const sine = E.addComponent(p, 'Sine');
  const env = E.addComponent(p, 'Sweep');
  E.connect(p, sine.id, env.id, 'signal');
  E.connect(p, env.id, E.getRecorder(p).id, 'signal');
  Object.assign(E.getRecorder(p).props, { duration: 0.01, sampleRate: SR });
  const r = E.render(p, { taps: true });
  assert.equal(r.taps[sine.id].length, 80);
  assert.equal(r.taps[env.id].length, 80);
  assert.equal(E.render(p).taps, null);
});

test('render reports validation errors and NaN output', () => {
  E.register('TestInvalid', { group: 'Sources', help: 'test', validate: () => 'always broken', render: (ctx) => new Float32Array(ctx.n) });
  E.register('TestNaN', { group: 'Sources', help: 'test', render: (ctx) => new Float32Array(ctx.n).fill(NaN) });
  const p = E.createPatch();
  const bad = E.addComponent(p, 'TestInvalid');
  assert.throws(() => E.render(p), /always broken/);
  E.removeComponent(p, bad.id);
  const nan = E.addComponent(p, 'TestNaN');
  E.connect(p, nan.id, E.getRecorder(p).id, 'signal');
  assert.throws(() => E.render(p), /NaN/);
  delete E.TYPES.TestInvalid;
  delete E.TYPES.TestNaN;
});

test('base64 round-trips bytes of every length', () => {
  for (let n = 0; n < 10; n++) {
    const bytes = new Uint8Array(n).map((_, i) => (i * 97 + 13) & 255);
    const b64 = E.bytesToBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    assert.deepEqual(E.base64ToBytes(b64), bytes);
  }
});
