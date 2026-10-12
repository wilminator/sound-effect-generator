/*
 * Switch: outputs In k, where k = floor(Select). Select can change on any sample, so it
 * switches as often as its signal does. Wrap cycles k past the last input.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../core/engine.js'));
  else factory(root.QuackEngine);
})(typeof self !== 'undefined' ? self : this, function (E) {
  'use strict';

  E.register('Switch', {
    group: 'Mixers',
    help: 'Picks one of its inputs by number. Feed a Counter into Select to step through them.',
    inputsFor: function (c) {
      var list = [{ key: 'select', label: 'Select', default: 0 }];
      for (var k = 0; k < c.props.channels; k++) list.push({ key: 'in' + k, label: 'In ' + k, default: 0 });
      return list;
    },
    props: [
      E.num('channels', 'Inputs', 2, { min: 2, max: 64, step: 1 }),
      { key: 'wrap', label: 'Wrap around', type: 'bool', default: false }
    ],
    render: function (ctx) {
      var count = Math.max(1, Math.round(ctx.props.channels));
      var sel = ctx.input('select');
      var ins = [];
      for (var k = 0; k < count; k++) ins.push(ctx.input('in' + k));
      var out = new Float32Array(ctx.n);
      for (var i = 0; i < ctx.n; i++) {
        var idx = Math.floor(sel[i]);
        if (ctx.props.wrap) idx = ((idx % count) + count) % count;
        else idx = E.clamp(idx, 0, count - 1);
        out[i] = ins[idx][i];
      }
      return out;
    }
  });
});
