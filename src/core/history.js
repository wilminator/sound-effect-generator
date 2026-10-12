/*
 * Undo/redo history of saved-patch snapshots (strings from QuackEngine.serialize).
 * Changes recorded within `mergeMs` of each other become one step, so typing a number
 * or dragging a component undoes in one go.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuackHistory = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function History(options) {
    options = options || {};
    this.limit = options.limit || 100;
    this.mergeMs = options.mergeMs === undefined ? 600 : options.mergeMs;
    this.past = [];
    this.future = [];
    this.current = null;
    this.lastTime = -Infinity;
  }

  /** Records the state after a change. Returns true when it differs from the current one. */
  History.prototype.record = function (state, now) {
    if (now === undefined) now = Date.now();
    if (state === this.current) return false;
    if (this.current !== null && now - this.lastTime >= this.mergeMs) {
      this.past.push(this.current);
      if (this.past.length > this.limit) this.past.shift();
    }
    this.current = state;
    this.future = [];
    this.lastTime = now;
    return true;
  };

  /** Starts a new step on the next record, even if it comes quickly. */
  History.prototype.seal = function () {
    this.lastTime = -Infinity;
  };

  History.prototype.canUndo = function () { return this.past.length > 0; };
  History.prototype.canRedo = function () { return this.future.length > 0; };

  /** Returns the previous state, or null if there is none. */
  History.prototype.undo = function () {
    if (!this.past.length) return null;
    this.future.push(this.current);
    this.current = this.past.pop();
    this.seal();
    return this.current;
  };

  /** Returns the next state, or null if there is none. */
  History.prototype.redo = function () {
    if (!this.future.length) return null;
    this.past.push(this.current);
    this.current = this.future.pop();
    this.seal();
    return this.current;
  };

  return { History: History };
});
