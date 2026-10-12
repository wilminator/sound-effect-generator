const test = require('node:test');
const assert = require('node:assert/strict');
const { History } = require('../../src/core/history.js');

test('undo and redo step through recorded states', () => {
  const h = new History({ mergeMs: 0 });
  h.record('a', 0);
  h.record('b', 10);
  h.record('c', 20);
  assert.equal(h.undo(), 'b');
  assert.equal(h.undo(), 'a');
  assert.equal(h.undo(), null);
  assert.equal(h.redo(), 'b');
  assert.equal(h.redo(), 'c');
  assert.equal(h.redo(), null);
});

test('a new change clears redo, and unchanged states are ignored', () => {
  const h = new History({ mergeMs: 0 });
  h.record('a', 0);
  h.record('b', 1);
  assert.equal(h.record('b', 2), false);
  h.undo();
  h.record('x', 3);
  assert.equal(h.canRedo(), false);
  assert.equal(h.undo(), 'a');
});

test('quick changes merge into one step unless sealed', () => {
  const h = new History({ mergeMs: 500 });
  h.record('a', 0);
  h.record('ab', 1000);
  h.record('abc', 1100);
  assert.equal(h.undo(), 'a');
  h.redo();
  h.seal();
  h.record('abcd', 1150);
  assert.equal(h.undo(), 'abc');
});

test('history keeps at most `limit` steps', () => {
  const h = new History({ mergeMs: 0, limit: 3 });
  for (let i = 0; i < 10; i++) h.record(String(i), i);
  let n = 0;
  while (h.undo() !== null) n++;
  assert.equal(n, 3);
});
