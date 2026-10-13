/*
 * Patch-board UI. Rendering and patch rules live in engine.js.
 * Everything here is generic: the board, editors, actions and help come from each
 * component definition (inputs, props, actions, help), never from component names.
 */
(function () {
  'use strict';

  var E = window.QuackEngine;
  var EXAMPLES = window.QuackExamples;
  var STORAGE_KEY = 'quack.patch';
  var CUSTOM_KEY = 'quack.custom';
  var THEME_KEY = 'quack.theme';
  // A patch property stores the loaded patch itself; its file name rides along under
  // this key, which engine.parse ignores, so it survives save and load.
  var FILE_NAME_KEY = 'quackFileName';

  var patch = loadSaved() || EXAMPLES['Simple tone']();
  var selectedId = null;
  var lastRender = null;
  var lastTaps = null;
  var audioCtx = null;
  var clipboard = null;
  var lastPointer = { x: 60, y: 60 };

  var canvas = document.getElementById('canvas');
  var board = document.getElementById('board');
  var wires = document.getElementById('wires');
  var panel = document.getElementById('panel');
  var statusEl = document.getElementById('status');
  var createBtn = document.getElementById('create');
  var playBtn = document.getElementById('play');
  var exportBtn = document.getElementById('export');
  var formatSelect = document.getElementById('format');

  function noop() {}

  // ------------------------------------------------------------ storage

  function storeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }

  function storeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable */ }
  }

  function loadSaved() {
    try {
      var text = storeGet(STORAGE_KEY);
      return text ? E.parse(text) : null;
    } catch (e) {
      return null;
    }
  }

  /** Saves the patch for the next visit and records it as an undo step. */
  function autosave() {
    var text = E.serialize(patch);
    storeSet(STORAGE_KEY, text);
    if (!restoring) history.record(text);
    undoBtn.disabled = !history.canUndo();
    redoBtn.disabled = !history.canRedo();
  }

  // ------------------------------------------------------------ undo / redo

  var history = new window.QuackHistory.History();
  var restoring = false;
  var undoBtn = document.getElementById('undo');
  var redoBtn = document.getElementById('redo');

  function restore(text) {
    if (text === null) return;
    restoring = true;
    try {
      patch = E.parse(text);
      if (selectedId && !E.getComponent(patch, selectedId)) selectedId = null;
      changed();
    } finally {
      restoring = false;
    }
  }

  function undo() {
    var text = history.undo();
    restore(text);
    setStatus(text === null ? 'Nothing to undo' : 'Undone');
  }

  function redo() {
    var text = history.redo();
    restore(text);
    setStatus(text === null ? 'Nothing to redo' : 'Redone');
  }

  undoBtn.addEventListener('click', undo);
  redoBtn.addEventListener('click', redo);

  /** Call after any change to the patch. */
  function changed() {
    E.normalize(patch);
    lastRender = null;
    playBtn.disabled = true;
    exportBtn.disabled = true;
    autosave();
    drawBoard();
    drawPanel();
    syncScopes();
  }

  /** Replaces the whole patch (New, Open, Examples). */
  function setPatch(p) {
    patch = p;
    selectedId = null;
    lastTaps = null;
    closeAllScopes();
    changed();
    drawSideScope();
  }

  function setStatus(text, warn) {
    statusEl.textContent = text;
    statusEl.classList.toggle('warn', !!warn);
  }

  function el(tag, attrs, text) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function button(text, onClick, attrs) {
    var b = el('button', attrs || {}, text);
    b.type = 'button';
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }

  function defOf(c) {
    return E.TYPES[c.type];
  }

  function isStereoOut(c) {
    try { return E.isStereoOutput(c); } catch (e) { return false; }
  }

  function validationErrors() {
    var map = {};
    try {
      E.validate(patch).forEach(function (v) { map[v.id] = v.error; });
    } catch (e) { /* a module's validate threw; render will report it */ }
    return map;
  }

  function boardPoint() {
    return { x: board.scrollLeft + 40 + Math.random() * 80, y: board.scrollTop + 40 + Math.random() * 80 };
  }

  function safeName(n, fallback) {
    return String(n).replace(/[\\/:*?"<>|]+/g, '').trim() || fallback;
  }

  // ------------------------------------------------------------ theme

  var THEMES = ['auto', 'light', 'dark'];
  var themeBtn = document.getElementById('theme');
  function applyTheme(t) {
    if (THEMES.indexOf(t) < 0) t = 'auto';
    if (t === 'auto') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
    if (themeBtn) themeBtn.textContent = 'Theme: ' + t.charAt(0).toUpperCase() + t.slice(1);
    return t;
  }
  var theme = applyTheme(storeGet(THEME_KEY));
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      theme = applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
      storeSet(THEME_KEY, theme);
      drawSideScope();
      scopes.forEach(function (s) { redrawScope(s); });
    });
  }

  // ------------------------------------------------------------ toolbar

  var toolbar = document.getElementById('toolbar');
  var groups = {};
  var groupOrder = E.GROUPS.slice();
  Object.keys(E.TYPES).forEach(function (type) {
    var g = E.TYPES[type].group || 'Other';
    if (g === 'Output') return;
    if (groupOrder.indexOf(g) < 0) groupOrder.push(g);
    (groups[g] = groups[g] || []).push(type);
  });
  groupOrder.forEach(function (g) {
    if (!groups[g]) return;
    var wrap = el('div', { class: 'group', role: 'group', 'aria-label': g });
    wrap.appendChild(el('span', { class: 'group-label' }, g));
    groups[g].forEach(function (type) {
      wrap.appendChild(button(type, function () {
        var p = boardPoint();
        var c = E.addComponent(patch, type, p.x, p.y);
        selectedId = c.id;
        changed();
      }, { title: E.TYPES[type].help || type }));
    });
    toolbar.appendChild(wrap);
  });

  // The Custom group: loaded custom component files, remembered as buttons.
  var customGroup = el('div', { class: 'group custom-group', role: 'group', 'aria-label': 'Custom' });
  var ccfInput = el('input', { type: 'file', accept: '.json,application/json', hidden: '', id: 'ccf-file' });
  toolbar.appendChild(customGroup);
  document.body.appendChild(ccfInput);

  function loadCustomList() {
    try {
      var list = JSON.parse(storeGet(CUSTOM_KEY) || '[]');
      return Array.isArray(list) ? list.filter(function (x) { return x && x.ccf && E.TYPES[x.ccf.type]; }) : [];
    } catch (e) {
      return [];
    }
  }

  function saveCustomList(list) {
    storeSet(CUSTOM_KEY, JSON.stringify(list));
  }

  function addCustomToPatch(ccf, x, y) {
    var c = E.addCustom(patch, ccf, x, y);
    selectedId = c.id;
    changed();
    return c;
  }

  function drawCustomGroup() {
    customGroup.innerHTML = '';
    customGroup.appendChild(el('span', { class: 'group-label' }, 'Custom'));
    customGroup.appendChild(button('Load…', function () { ccfInput.click(); }, {
      id: 'ccf-load', title: 'Load a custom component file (.ccf.json) and keep it as a button here'
    }));
    loadCustomList().forEach(function (item) {
      var chip = el('span', { class: 'chip' });
      var help = E.TYPES[item.ccf.type].help;
      chip.appendChild(button(item.name, function () {
        var p = boardPoint();
        try { addCustomToPatch(item.ccf, p.x, p.y); } catch (err) { setStatus(err.message, true); }
      }, { class: 'custom-add', title: item.ccf.type + (help ? ': ' + help : '') }));
      chip.appendChild(button('×', function () {
        saveCustomList(loadCustomList().filter(function (x) { return x.name !== item.name; }));
        drawCustomGroup();
      }, { class: 'custom-remove', 'aria-label': 'Remove custom component ' + item.name, title: 'Remove ' + item.name }));
      customGroup.appendChild(chip);
    });
  }

  ccfInput.addEventListener('change', function () {
    var f = ccfInput.files[0];
    ccfInput.value = '';
    if (!f) return;
    f.text().then(function (text) {
      var data = JSON.parse(text);
      var p = boardPoint();
      addCustomToPatch(data, p.x, p.y);
      var name = String(data.name || data.type);
      var list = loadCustomList().filter(function (x) { return x.name !== name; });
      list.push({ name: name, ccf: data });
      saveCustomList(list);
      drawCustomGroup();
      setStatus('Loaded custom component ' + name);
    }).catch(function (err) {
      setStatus('Could not load ' + f.name + ': ' + err.message, true);
    });
  });
  drawCustomGroup();

  var exampleSelect = document.getElementById('examples');
  exampleSelect.appendChild(el('option', { value: '' }, 'Examples…'));
  Object.keys(EXAMPLES).forEach(function (name) {
    exampleSelect.appendChild(el('option', { value: name }, name));
  });
  exampleSelect.addEventListener('change', function () {
    if (!exampleSelect.value) return;
    var p = EXAMPLES[exampleSelect.value]();
    exampleSelect.value = '';
    setPatch(p);
    setStatus('');
  });

  // ------------------------------------------------------------ board

  function formatValue(v) {
    if (typeof v !== 'number') return String(v);
    return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 1000) / 1000);
  }

  function select(id) {
    if (selectedId === id) return;
    selectedId = id;
    markSelected();
    drawPanel();
  }

  function drawBoard() {
    var ae = document.activeElement;
    var focusedNode = ae && ae.classList && ae.classList.contains('node');
    var errors = validationErrors();
    Array.prototype.slice.call(canvas.querySelectorAll('.node')).forEach(function (n) { n.remove(); });
    patch.components.forEach(function (c) {
      var def = defOf(c);
      var err = errors[c.id];
      var stereoOut = isStereoOut(c);
      var node = el('div', { class: 'node', tabindex: '0', role: 'group', 'aria-label': c.name + ' (' + c.type + ')' });
      if (c.id === selectedId) node.classList.add('selected');
      if (err) {
        node.classList.add('invalid');
        node.title = c.name + ': ' + err;
      }
      node.dataset.id = c.id;
      node.style.left = c.x + 'px';
      node.style.top = c.y + 'px';

      var title = el('div', { class: 'node-title', title: def.help || c.type });
      title.appendChild(document.createTextNode(c.name));
      if (c.name.replace(/\d+$/, '') !== c.type.replace(/[^A-Za-z0-9]+/g, '')) {
        title.appendChild(el('span', { class: 'node-type' }, c.type));
      }
      if (err) title.appendChild(el('span', { class: 'node-error', title: err }, '!'));
      if (!def.noOutput) {
        var out = el('span', { class: 'dot out' + (stereoOut ? ' stereo' : ''), title: stereoOut ? 'Output (stereo)' : 'Output' });
        out.dataset.out = c.id;
        title.appendChild(out);
      }
      node.appendChild(title);

      E.inputsOf(c).forEach(function (input) {
        var row = el('div', { class: 'in-row' });
        var dot = el('span', { class: 'dot in' + (input.stereo ? ' stereo' : ''), title: input.label + (input.stereo ? ' (stereo)' : '') });
        dot.dataset.to = c.id;
        dot.dataset.input = input.key;
        row.appendChild(dot);
        row.appendChild(el('span', {}, input.label));
        if (input.stereo) row.appendChild(el('span', { class: 'badge', title: 'Stereo input' }, 'ST'));
        var src = E.sourceOf(patch, c.id, input.key);
        row.appendChild(el('span', { class: 'val' }, src ? '' : formatValue(c.inputs[input.key])));
        node.appendChild(row);
      });

      title.addEventListener('pointerdown', startMove);
      node.addEventListener('pointerdown', function (e) {
        select(c.id);
        if (e.pointerType === 'touch') startLongPress(node, c, e);
      });
      node.addEventListener('focus', function () { select(c.id); });
      node.addEventListener('contextmenu', function (e) {
        e.preventDefault();
        e.stopPropagation();
        select(c.id);
        rememberPointer(e);
        openMenu(c, e.clientX, e.clientY);
      });
      node.addEventListener('keydown', function (e) {
        if (e.target !== node) return;
        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) {
          e.preventDefault();
          var r = node.getBoundingClientRect();
          openMenu(c, r.left + 20, r.top + 20);
        } else if (e.key === 'Enter') {
          e.preventDefault();
          var first = panel.querySelector('input, select, textarea, button');
          if (first) first.focus();
        }
      });
      canvas.appendChild(node);
    });
    drawWires();
    if (focusedNode && selectedId) {
      var again = canvas.querySelector('.node[data-id="' + cssEscape(selectedId) + '"]');
      if (again) again.focus();
    }
  }

  function markSelected() {
    Array.prototype.forEach.call(canvas.querySelectorAll('.node'), function (n) {
      n.classList.toggle('selected', n.dataset.id === selectedId);
    });
  }

  function dotCenter(dot) {
    var r = dot.getBoundingClientRect();
    var base = canvas.getBoundingClientRect();
    return { x: r.left + r.width / 2 - base.left, y: r.top + r.height / 2 - base.top };
  }

  // Component ids come from patch files, so they are escaped before going into selectors or markup.
  function cssEscape(v) {
    v = String(v);
    return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/[^\w-]/g, '\\$&');
  }

  function escapeAttr(v) {
    return String(v).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function wirePath(a, b) {
    var dx = Math.max(40, Math.abs(b.x - a.x) / 2);
    return 'M' + a.x + ',' + a.y + ' C' + (a.x + dx) + ',' + a.y + ' ' + (b.x - dx) + ',' + b.y + ' ' + b.x + ',' + b.y;
  }

  // Stereo connections are drawn as double lines: a wide stroke with a thin gap on top.
  function drawWires(temp) {
    var paths = patch.connections.map(function (k) {
      var outDot = canvas.querySelector('.dot.out[data-out="' + cssEscape(k.from) + '"]');
      var inDot = canvas.querySelector('.dot.in[data-to="' + cssEscape(k.to) + '"][data-input="' + cssEscape(k.input) + '"]');
      if (!outDot || !inDot) return '';
      var d = wirePath(dotCenter(outDot), dotCenter(inDot));
      var from = E.getComponent(patch, k.from);
      if (from && isStereoOut(from)) {
        return '<g class="wire stereo" data-from="' + escapeAttr(k.from) + '"><path class="rail" d="' + d + '"/><path class="gap" d="' + d + '"/></g>';
      }
      return '<path class="wire mono" data-from="' + escapeAttr(k.from) + '" d="' + d + '"/>';
    });
    if (temp) paths.push('<path class="temp" d="' + wirePath(temp.a, temp.b) + '"/>');
    wires.innerHTML = paths.join('');
  }

  function rememberPointer(e) {
    var base = canvas.getBoundingClientRect();
    lastPointer = { x: Math.max(0, e.clientX - base.left), y: Math.max(0, e.clientY - base.top) };
  }
  canvas.addEventListener('pointermove', rememberPointer);
  canvas.addEventListener('pointerdown', rememberPointer);

  // Dragging a component by its title bar.
  function startMove(e) {
    if (e.target.classList.contains('dot') || e.button > 0) return;
    var title = e.currentTarget;
    var node = title.parentNode;
    var c = E.getComponent(patch, node.dataset.id);
    var startX = e.clientX;
    var startY = e.clientY;
    var origX = c.x;
    var origY = c.y;
    title.setPointerCapture(e.pointerId);
    function move(ev) {
      c.x = Math.max(0, origX + ev.clientX - startX);
      c.y = Math.max(0, origY + ev.clientY - startY);
      node.style.left = c.x + 'px';
      node.style.top = c.y + 'px';
      drawWires();
    }
    function up() {
      title.removeEventListener('pointermove', move);
      title.removeEventListener('pointerup', up);
      title.removeEventListener('pointercancel', up);
      if (c.x !== origX || c.y !== origY) {
        history.seal();
        autosave();
        history.seal();
      }
    }
    title.addEventListener('pointermove', move);
    title.addEventListener('pointerup', up);
    title.addEventListener('pointercancel', up);
  }

  // A long press on touch opens the context menu.
  function startLongPress(node, c, e) {
    var sx = e.clientX;
    var sy = e.clientY;
    var timer = setTimeout(function () {
      timer = null;
      cleanup();
      openMenu(c, sx, sy);
    }, 550);
    function move(ev) {
      if (Math.abs(ev.clientX - sx) > 10 || Math.abs(ev.clientY - sy) > 10) cleanup();
    }
    function cleanup() {
      if (timer) clearTimeout(timer);
      timer = null;
      node.removeEventListener('pointermove', move);
      node.removeEventListener('pointerup', cleanup);
      node.removeEventListener('pointercancel', cleanup);
    }
    node.addEventListener('pointermove', move);
    node.addEventListener('pointerup', cleanup);
    node.addEventListener('pointercancel', cleanup);
  }

  // Dragging a connection from an output to an input, or from an input to an output.
  canvas.addEventListener('pointerdown', function (e) {
    var dot = e.target;
    if (!dot.classList || !dot.classList.contains('dot') || e.button > 0) return;
    e.preventDefault();
    e.stopPropagation();
    var fromOutput = dot.classList.contains('out');
    var anchor = dotCenter(dot);
    var base = canvas.getBoundingClientRect();
    dot.setPointerCapture(e.pointerId);

    function move(ev) {
      var p = { x: ev.clientX - base.left, y: ev.clientY - base.top };
      drawWires(fromOutput ? { a: anchor, b: p } : { a: p, b: anchor });
    }
    function up(ev) {
      dot.removeEventListener('pointermove', move);
      dot.removeEventListener('pointerup', up);
      var target = document.elementFromPoint(ev.clientX, ev.clientY);
      var outDot = fromOutput ? dot : target;
      var inDot = fromOutput ? target : dot;
      if (outDot && inDot && outDot.dataset && inDot.dataset && outDot.dataset.out && inDot.dataset.to) {
        try {
          E.connect(patch, outDot.dataset.out, inDot.dataset.to, inDot.dataset.input);
          changed();
          return;
        } catch (err) {
          setStatus(err.message, true);
        }
      }
      drawWires();
    }
    dot.addEventListener('pointermove', move);
    dot.addEventListener('pointerup', up);
  });

  canvas.addEventListener('pointerdown', function (e) {
    if (e.target === canvas || e.target === wires) {
      selectedId = null;
      markSelected();
      drawPanel();
    }
  });

  canvas.addEventListener('contextmenu', function (e) {
    if (e.target !== canvas && e.target !== wires) return;
    e.preventDefault();
    rememberPointer(e);
    openMenu(null, e.clientX, e.clientY);
  });

  // ------------------------------------------------------------ commands

  function canCopy(c) {
    return !!c && !defOf(c).noOutput;
  }

  function copyComponent(c) {
    if (!canCopy(c)) return false;
    clipboard = JSON.stringify(E.saveCustom(c));
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(clipboard).catch(noop);
    } catch (e) { /* the system clipboard is optional */ }
    setStatus('Copied ' + c.name);
    return true;
  }

  function cutComponent(c) {
    if (!copyComponent(c)) return;
    E.removeComponent(patch, c.id);
    if (selectedId === c.id) selectedId = null;
    changed();
    setStatus('Cut ' + c.name);
  }

  function pasteComponent(x, y) {
    if (!clipboard) {
      setStatus('Nothing to paste. Copy a component first.', true);
      return;
    }
    if (x === undefined) {
      x = lastPointer.x;
      y = lastPointer.y;
    }
    // Don't stack a paste exactly on top of another component.
    while (patch.components.some(function (o) { return Math.abs(o.x - x) < 4 && Math.abs(o.y - y) < 4; })) {
      x += 20;
      y += 20;
    }
    try {
      var c = E.addCustom(patch, clipboard, x, y);
      selectedId = c.id;
      changed();
      setStatus('Pasted ' + c.name);
    } catch (err) {
      setStatus('Could not paste: ' + err.message, true);
    }
  }

  function duplicate(c) {
    if (!canCopy(c)) return;
    var copy = E.duplicateComponent(patch, c.id);
    selectedId = copy.id;
    changed();
  }

  function deleteComponent(c) {
    if (!c || c.type === 'Recorder') return;
    E.removeComponent(patch, c.id);
    if (selectedId === c.id) selectedId = null;
    changed();
  }

  function renameStart(c) {
    selectedId = c.id;
    markSelected();
    drawPanel();
    var name = panel.querySelector('[data-fkey="name"]');
    if (name) {
      name.focus();
      name.select();
    }
  }

  function showProperties(c) {
    selectedId = c.id;
    markSelected();
    drawPanel();
    if (panel.scrollIntoView) panel.scrollIntoView({ block: 'nearest' });
    var first = panel.querySelector('input, select, textarea');
    if (first) first.focus();
  }

  // ------------------------------------------------------------ context menu

  var menu = null;
  var menuReturnFocus = null;

  function closeMenu() {
    if (!menu) return;
    menu.remove();
    menu = null;
    if (menuReturnFocus && document.body.contains(menuReturnFocus) && menuReturnFocus.focus) menuReturnFocus.focus();
    menuReturnFocus = null;
  }

  function openMenu(c, x, y) {
    closeMenu();
    menuReturnFocus = document.activeElement;
    var px = lastPointer.x;
    var py = lastPointer.y;
    var items = c ? [
      ['Inputs/Properties', function () { showProperties(c); }, true],
      ['Rename', function () { renameStart(c); }, true],
      null,
      ['Cut', function () { cutComponent(c); }, canCopy(c), 'Ctrl+X'],
      ['Copy', function () { copyComponent(c); }, canCopy(c), 'Ctrl+C'],
      ['Paste', function () { pasteComponent(px, py); }, !!clipboard, 'Ctrl+V'],
      ['Duplicate', function () { duplicate(c); }, canCopy(c), 'Ctrl+D'],
      null,
      ['Disconnect output', function () { E.disconnectOutput(patch, c.id); changed(); }, !defOf(c).noOutput && !!E.targetOf(patch, c.id)],
      ['Delete', function () { deleteComponent(c); }, c.type !== 'Recorder', 'Del'],
      null,
      ['Scope', function () { openScope(c.id); }, true]
    ] : [
      ['Paste', function () { pasteComponent(px, py); }, !!clipboard, 'Ctrl+V']
    ];
    menu = el('div', { class: 'menu', role: 'menu', 'aria-label': c ? c.name : 'Board' });
    items.forEach(function (it) {
      if (!it) {
        menu.appendChild(el('div', { class: 'sep', role: 'separator' }));
        return;
      }
      var b = button('', function () {
        // The command may move focus itself, so don't hand it back to the old element.
        menuReturnFocus = null;
        closeMenu();
        it[1]();
      }, { role: 'menuitem', 'data-command': it[0] });
      b.appendChild(el('span', {}, it[0]));
      if (it[3]) b.appendChild(el('kbd', {}, it[3]));
      b.disabled = !it[2];
      menu.appendChild(b);
    });
    menu.addEventListener('keydown', function (e) {
      var list = Array.prototype.filter.call(menu.querySelectorAll('button'), function (b) { return !b.disabled; });
      var i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        list[(i + 1) % list.length].focus();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        list[(i - 1 + list.length) % list.length].focus();
      } else if (e.key === 'Escape' || e.key === 'Tab') {
        e.preventDefault();
        closeMenu();
      }
    });
    document.body.appendChild(menu);
    var r = menu.getBoundingClientRect();
    menu.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + 'px';
    menu.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + 'px';
    var first = menu.querySelector('button:not([disabled])');
    if (first) first.focus();
  }

  document.addEventListener('pointerdown', function (e) {
    if (menu && !menu.contains(e.target)) closeMenu();
  }, true);

  // ------------------------------------------------------------ dialogs (action fields)

  var modal = null;

  function fieldKind(spec) {
    if (spec.type) return spec.type;
    if (spec.options) return 'select';
    if (typeof spec.default === 'boolean') return 'bool';
    if (typeof spec.default === 'number') return 'number';
    return 'text';
  }

  /** A modal form with fields; calls onOk(values) when submitted. */
  function showForm(titleText, fields, onOk) {
    if (modal) modal.close();
    var back = el('div', { class: 'modal-back' });
    var titleId = 'm-' + Math.random().toString(36).slice(2);
    var form = el('form', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId });
    form.appendChild(el('h2', { id: titleId }, titleText));
    var values = {};
    fields.forEach(function (f) {
      values[f.key] = E.deepCopy(f.default);
      var control = valueControl(fieldKind(f), f, values[f.key], function (v) { values[f.key] = v; });
      control.setAttribute('data-field', f.key);
      form.appendChild(labelRow(f.label || f.key, control));
    });
    var buttons = el('div', { class: 'actions' });
    buttons.appendChild(el('button', { type: 'submit', class: 'primary' }, 'OK'));
    buttons.appendChild(button('Cancel', function () { close(); }));
    form.appendChild(buttons);
    back.appendChild(form);
    var returnFocus = document.activeElement;
    function close() {
      back.remove();
      modal = null;
      if (returnFocus && document.body.contains(returnFocus)) returnFocus.focus();
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Pick up values typed but not yet committed with a change event.
      Array.prototype.forEach.call(form.querySelectorAll('[data-field]'), function (n) {
        n.dispatchEvent(new Event('change'));
      });
      close();
      onOk(values);
    });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        close();
      }
    });
    document.body.appendChild(back);
    modal = { close: close };
    var first = form.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }

  var actionFile = el('input', { type: 'file', hidden: '', id: 'action-file' });
  document.body.appendChild(actionFile);
  var actionFileHandler = null;
  actionFile.addEventListener('change', function () {
    var f = actionFile.files[0];
    actionFile.value = '';
    var h = actionFileHandler;
    actionFileHandler = null;
    if (f && h) h(f);
  });

  function pickFile(accept, handler) {
    actionFile.setAttribute('accept', accept || '');
    actionFileHandler = handler;
    actionFile.click();
  }

  function finishAction(action, err) {
    changed();
    if (err) setStatus(action.label + ': ' + (err && err.message ? err.message : String(err)), true);
    else setStatus(action.label + ': done');
  }

  function invokeAction(c, action, args) {
    var result;
    try {
      result = action.run(c, args);
    } catch (err) {
      finishAction(action, err);
      return;
    }
    if (result && typeof result.then === 'function') {
      result.then(function () { finishAction(action); }, function (err) { finishAction(action, err); });
    } else {
      finishAction(action);
    }
  }

  function runAction(c, action) {
    function go(values) {
      if (action.file === 'text' || action.file === 'binary') {
        pickFile(action.accept, function (f) {
          var read = action.file === 'text'
            ? f.text().then(function (text) { return { values: values, text: text, name: f.name }; })
            : f.arrayBuffer().then(function (buf) { return { values: values, bytes: new Uint8Array(buf), name: f.name }; });
          read.then(function (args) { invokeAction(c, action, args); }, function (err) { finishAction(action, err); });
        });
      } else {
        invokeAction(c, action, { values: values });
      }
    }
    if (action.fields && action.fields.length) showForm(action.label, action.fields, go);
    else go({});
  }

  // ------------------------------------------------------------ property editors

  function labelRow(labelText, control, cls) {
    var r = el('div', { class: 'row' + (cls ? ' ' + cls : '') });
    if (!control.id) control.id = 'f-' + Math.random().toString(36).slice(2);
    r.appendChild(el('label', { for: control.id }, labelText));
    r.appendChild(control);
    return r;
  }

  function optionValue(o) {
    return o !== null && typeof o === 'object' ? o.value : o;
  }

  function optionLabel(o) {
    return o !== null && typeof o === 'object' ? String(o.label !== undefined ? o.label : o.value) : String(o);
  }

  function roundToStep(v, step) {
    if (!(step > 0)) return v;
    return Number((Math.round(v / step) * step).toFixed(10));
  }

  /**
   * An editor for one simple value (number, select, bool, text), used by properties,
   * table cells and dialog fields. Calls onChange(newValue). Select keeps the option's
   * own type (number or string).
   */
  function valueControl(kind, spec, value, onChange) {
    var control;
    if (kind === 'select') {
      control = el('select');
      (spec.options || []).forEach(function (o, i) {
        var opt = el('option', { value: String(i) }, optionLabel(o));
        if (String(optionValue(o)) === String(value)) opt.selected = true;
        control.appendChild(opt);
      });
      control.addEventListener('change', function () {
        onChange(optionValue(spec.options[Number(control.value)]));
      });
    } else if (kind === 'bool') {
      control = el('input', { type: 'checkbox' });
      control.checked = !!value;
      control.addEventListener('change', function () { onChange(control.checked); });
    } else if (kind === 'text') {
      control = spec.multiline ? el('textarea', { rows: '4', spellcheck: 'false' }) : el('input', { type: 'text' });
      control.value = value === undefined || value === null ? '' : String(value);
      control.addEventListener('change', function () { onChange(control.value); });
    } else {
      control = el('input', { type: 'number', step: spec.step !== undefined ? String(spec.step) : 'any', inputmode: 'decimal' });
      if (spec.min !== undefined) control.setAttribute('min', String(spec.min));
      if (spec.max !== undefined) control.setAttribute('max', String(spec.max));
      control.value = value;
      control.addEventListener('change', function () {
        var v = Number(control.value);
        if (control.value === '' || !isFinite(v)) {
          control.value = value;
          return;
        }
        if (spec.min !== undefined) v = Math.max(spec.min, v);
        if (spec.max !== undefined) v = Math.min(spec.max, v);
        v = roundToStep(v, spec.step);
        if (String(v) !== control.value) control.value = v;
        value = v;
        onChange(v);
      });
    }
    return control;
  }

  // Panel controls carry a stable key so focus survives the redraw after each edit.
  function fk(control, key) {
    control.setAttribute('data-fkey', key);
    return control;
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  function base64Size(s) {
    s = String(s || '').replace(/[^A-Za-z0-9+/=]/g, '');
    var pad = s.charAt(s.length - 1) === '=' ? (s.charAt(s.length - 2) === '=' ? 2 : 1) : 0;
    return Math.max(0, Math.floor(s.length * 3 / 4) - pad);
  }

  /** A row with a file name, a Choose/Load button and a Clear button; read(file) -> Promise of the new value. */
  function fileRow(c, p, shown, pickLabel, accept, read) {
    var r = el('div', { class: 'row file-row', 'data-prop': p.key });
    r.appendChild(el('label', {}, p.label));
    r.appendChild(el('span', { class: 'from file-name' }, shown));
    var picker = el('input', { type: 'file', accept: accept || '', hidden: '' });
    r.appendChild(fk(button(pickLabel, function () { picker.click(); }, { class: 'pick', 'aria-label': pickLabel.replace('…', '') + ' ' + p.label }), c.id + ':' + p.key + ':pick'));
    var clear = fk(button('Clear', function () {
      c.props[p.key] = null;
      changed();
    }, { class: 'clear', 'aria-label': 'Clear ' + p.label }), c.id + ':' + p.key + ':clear');
    clear.disabled = !c.props[p.key];
    r.appendChild(clear);
    picker.addEventListener('change', function () {
      var f = picker.files[0];
      if (!f) return;
      read(f).then(function (v) {
        c.props[p.key] = v;
        changed();
        setStatus('Loaded ' + f.name);
      }).catch(function (err) {
        setStatus('Could not load ' + f.name + ': ' + err.message, true);
      });
    });
    r.appendChild(picker);
    return r;
  }

  function fileEditor(c, p) {
    var v = c.props[p.key];
    var shown = v && v.name ? v.name + ' (' + formatBytes(base64Size(v.data)) + ')' : 'none';
    return fileRow(c, p, shown, 'Choose…', p.accept, function (f) {
      return f.arrayBuffer().then(function (buf) {
        return { name: f.name, data: E.bytesToBase64(new Uint8Array(buf)) };
      });
    });
  }

  /** Loads a saved patch file into a patch property, which stores a copy of it. */
  function patchEditor(c, p) {
    var v = c.props[p.key];
    var shown = v ? (v[FILE_NAME_KEY] || 'loaded patch') : 'none';
    return fileRow(c, p, shown, 'Load…', p.accept || '.json,application/json', function (f) {
      return f.text().then(function (text) {
        var data = JSON.parse(text);
        E.parse(data); // validate before storing
        data[FILE_NAME_KEY] = f.name;
        return data;
      });
    });
  }

  function columnDefault(col) {
    if (col.default !== undefined) return E.deepCopy(col.default);
    if (col.type === 'number') return 0;
    if (col.type === 'bool') return false;
    if (col.type === 'select') return col.options && col.options.length ? optionValue(col.options[0]) : '';
    return '';
  }

  function tableEditor(c, p) {
    var cols = p.columns || [];
    var rows = Array.isArray(c.props[p.key]) ? c.props[p.key] : [];
    var base = c.id + ':' + p.key + ':';
    function commit() {
      c.props[p.key] = rows;
      changed();
    }
    function tool(text, label, key, disabled, fn) {
      var b = fk(button(text, function () {
        fn();
        commit();
      }, { 'aria-label': label, title: label }), base + key);
      b.disabled = disabled;
      return b;
    }
    var wrap = el('div', { class: 'table-edit', 'data-prop': p.key });
    wrap.appendChild(el('div', { class: 'table-label' }, p.label));
    var scroller = el('div', { class: 'table-scroll' });
    var table = el('table', { 'aria-label': p.label });
    var head = el('tr');
    head.appendChild(el('th', { scope: 'col' }, '#'));
    cols.forEach(function (col) { head.appendChild(el('th', { scope: 'col' }, col.label || col.key)); });
    head.appendChild(el('th', { scope: 'col' }, ''));
    var thead = el('thead');
    thead.appendChild(head);
    table.appendChild(thead);
    var tbody = el('tbody');
    rows.forEach(function (rowData, ri) {
      var tr = el('tr');
      tr.appendChild(el('td', { class: 'idx' }, String(ri + 1)));
      cols.forEach(function (col) {
        var td = el('td');
        var control = valueControl(col.type || 'text', col, rowData[col.key], function (v) {
          rowData[col.key] = v;
          commit();
        });
        control.setAttribute('aria-label', (col.label || col.key) + ' ' + (ri + 1));
        control.setAttribute('data-col', col.key);
        fk(control, base + ri + ':' + col.key);
        td.appendChild(control);
        tr.appendChild(td);
      });
      var tools = el('td', { class: 'row-tools' });
      tools.appendChild(tool('↑', 'Move row ' + (ri + 1) + ' up', ri + ':up', ri === 0, function () {
        rows.splice(ri - 1, 0, rows.splice(ri, 1)[0]);
      }));
      tools.appendChild(tool('↓', 'Move row ' + (ri + 1) + ' down', ri + ':down', ri === rows.length - 1, function () {
        rows.splice(ri + 1, 0, rows.splice(ri, 1)[0]);
      }));
      tools.appendChild(tool('✕', 'Delete row ' + (ri + 1), ri + ':del', false, function () {
        rows.splice(ri, 1);
      }));
      tr.appendChild(tools);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    scroller.appendChild(table);
    wrap.appendChild(scroller);
    var add = tool('Add row', 'Add row to ' + p.label, 'add', false, function () {
      var r = {};
      cols.forEach(function (col) { r[col.key] = columnDefault(col); });
      rows.push(r);
    });
    add.classList.add('add-row');
    wrap.appendChild(add);
    return wrap;
  }

  function propEditor(c, p) {
    if (p.type === 'patch') return patchEditor(c, p);
    if (p.type === 'file') return fileEditor(c, p);
    if (p.type === 'table') return tableEditor(c, p);
    var control = valueControl(p.type, p, c.props[p.key], function (v) {
      c.props[p.key] = v;
      changed();
    });
    fk(control, c.id + ':' + p.key);
    var r = labelRow(p.label, control, p.type === 'text' && p.multiline ? 'multiline' : '');
    r.setAttribute('data-prop', p.key);
    return r;
  }

  // ------------------------------------------------------------ side panel

  function drawPanel() {
    var active = document.activeElement;
    var refocus = active && panel.contains(active) ? active.getAttribute('data-fkey') : null;
    panel.innerHTML = '';
    var c = selectedId && E.getComponent(patch, selectedId);
    if (!c) {
      panel.appendChild(el('p', { class: 'hint' }, 'Select a component to edit it. Right-click (or long-press) a component for more commands.'));
      return;
    }
    var def = defOf(c);
    panel.appendChild(el('h2', {}, c.type));
    if (def.help) panel.appendChild(el('p', { class: 'help' }, def.help));
    var err = validationErrors()[c.id];
    if (err) panel.appendChild(el('p', { class: 'error', role: 'alert' }, err));

    var name = fk(el('input', { type: 'text' }), 'name');
    name.value = c.name;
    name.addEventListener('change', function () {
      E.renameComponent(patch, c.id, name.value);
      changed();
    });
    panel.appendChild(labelRow('Name', name));

    var inputs = E.inputsOf(c);
    if (inputs.length) {
      panel.appendChild(el('h3', {}, 'Inputs'));
      inputs.forEach(function (input) {
        var label = input.label + (input.stereo ? ' (stereo)' : '');
        var src = E.sourceOf(patch, c.id, input.key);
        if (src) {
          var r = el('div', { class: 'row' });
          r.appendChild(el('label', {}, label));
          r.appendChild(el('span', { class: 'from' }, 'from ' + E.getComponent(patch, src.from).name));
          r.appendChild(fk(button('Disconnect', function () {
            E.disconnectInput(patch, c.id, input.key);
            changed();
          }), c.id + ':in:' + input.key + ':disc'));
          panel.appendChild(r);
        } else {
          var control = valueControl('number', {}, c.inputs[input.key], function (v) {
            c.inputs[input.key] = v;
            changed();
          });
          fk(control, c.id + ':in:' + input.key);
          panel.appendChild(labelRow(label, control));
        }
      });
    }

    if (def.props.length) {
      panel.appendChild(el('h3', {}, 'Properties'));
      def.props.forEach(function (p) { panel.appendChild(propEditor(c, p)); });
    }

    if (def.actions && def.actions.length) {
      panel.appendChild(el('h3', {}, 'Actions'));
      var acts = el('div', { class: 'actions' });
      def.actions.forEach(function (a, i) {
        acts.appendChild(fk(button(a.label, function () { runAction(c, a); }, { class: 'action', title: a.help || a.label }), c.id + ':action:' + i));
      });
      panel.appendChild(acts);
    }

    var cmds = el('div', { class: 'actions' });
    if (!def.noOutput) {
      cmds.appendChild(fk(button('Disconnect output', function () {
        E.disconnectOutput(patch, c.id);
        changed();
      }), 'cmd:disc'));
      cmds.appendChild(fk(button('Duplicate', function () { duplicate(c); }), 'cmd:dup'));
    }
    cmds.appendChild(fk(button('Scope', function () { openScope(c.id); }), 'cmd:scope'));
    if (c.type !== 'Recorder') {
      cmds.appendChild(fk(button('Delete', function () { deleteComponent(c); }), 'cmd:del'));
    }
    if (canCopy(c)) {
      cmds.appendChild(fk(button('Save as custom component', function () {
        var data = E.saveCustom(c);
        var file = safeName(data.name, 'custom') + '.ccf.json';
        downloadBlob(JSON.stringify(data, null, 2), 'application/json', file);
        setStatus('Saved ' + file);
      }, { id: 'save-custom' }), 'cmd:ccf'));
    }
    panel.appendChild(cmds);

    if (refocus) {
      var all = panel.querySelectorAll('[data-fkey]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute('data-fkey') === refocus) {
          all[i].focus();
          break;
        }
      }
    }
  }

  // ------------------------------------------------------------ keyboard

  document.addEventListener('keydown', function (e) {
    if (modal) return;
    if (e.key === 'Escape' && menu) {
      closeMenu();
      return;
    }
    var tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
    if (menu && menu.contains(e.target)) return;
    var mod = e.ctrlKey || e.metaKey;
    var key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    var c = selectedId && E.getComponent(patch, selectedId);
    if (mod && (key === 'i' || key === 'o') && activeScope) {
      e.preventDefault();
      zoomScope(activeScope, key === 'i' ? 1 : -1);
      return;
    }
    // Shortcuts inside a scope window act on the scope only.
    if (e.target.closest && e.target.closest('.scope-win')) return;
    if (mod && (key === 'z' || key === 'y')) {
      e.preventDefault();
      if (key === 'y' || e.shiftKey) redo();
      else undo();
      return;
    }
    if (!mod && !e.altKey && (key === 'Delete' || key === 'Backspace')) {
      e.preventDefault();
      deleteComponent(c);
    } else if (mod && key === 'c' && c) {
      e.preventDefault();
      copyComponent(c);
    } else if (mod && key === 'x' && c) {
      e.preventDefault();
      cutComponent(c);
    } else if (mod && key === 'v') {
      e.preventDefault();
      pasteComponent();
    } else if (mod && key === 'd' && c) {
      e.preventDefault();
      duplicate(c);
    }
  });

  // ------------------------------------------------------------ signal drawing

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function sigLength(sig) {
    return sig ? (E.isStereo(sig) ? sig.left.length : sig.length) : 0;
  }

  /**
   * Draws a mono or stereo signal into a canvas from sample `start` at `spp` samples
   * per pixel, one lane per channel. fixed: the scale is -1..1; otherwise it fits the
   * signal's own range (so an offset signal fills the lane too).
   */
  function drawSignal(cv, sig, start, spp, fixed) {
    var g = cv.getContext('2d');
    var w = cv.width;
    var h = cv.height;
    g.fillStyle = cssVar('--panel') || '#fff';
    g.fillRect(0, 0, w, h);
    if (!sig) return;
    var lanes = E.isStereo(sig) ? [sig.left, sig.right] : [sig];
    var lo = -1;
    var hi = 1;
    if (!fixed) {
      lo = Infinity;
      hi = -Infinity;
      lanes.forEach(function (d) {
        for (var i = 0; i < d.length; i++) {
          if (d[i] < lo) lo = d[i];
          if (d[i] > hi) hi = d[i];
        }
      });
      if (!isFinite(lo) || !isFinite(hi)) {
        lo = -1;
        hi = 1;
      } else if (hi - lo < 1e-9) {
        var pad = Math.abs(hi) > 1e-9 ? Math.abs(hi) : 1;
        lo -= pad;
        hi += pad;
      }
    }
    var laneH = h / lanes.length;
    var colors = [cssVar('--accent'), cssVar('--out')];
    var muted = cssVar('--muted');
    g.font = '10px system-ui, sans-serif';
    lanes.forEach(function (d, li) {
      var top = li * laneH + 2;
      var span = laneH - 4;
      function y(v) {
        var u = (v - lo) / (hi - lo);
        if (u !== u) u = 0.5;
        return top + (1 - Math.max(0, Math.min(1, u))) * span;
      }
      g.strokeStyle = cssVar('--border');
      g.lineWidth = 1;
      g.beginPath();
      if (lo <= 0 && hi >= 0) {
        // The zero line.
        g.moveTo(0, Math.round(y(0)) + 0.5);
        g.lineTo(w, Math.round(y(0)) + 0.5);
      }
      if (li > 0) {
        g.moveTo(0, Math.round(li * laneH) + 0.5);
        g.lineTo(w, Math.round(li * laneH) + 0.5);
      }
      g.stroke();
      g.strokeStyle = colors[li] || colors[0];
      g.beginPath();
      var x;
      if (spp <= 1) {
        // One sample per pixel or fewer: join the samples.
        for (x = 0; x < w; x++) {
          var i = Math.floor(start + x * spp);
          if (i >= d.length) break;
          if (x === 0) g.moveTo(x + 0.5, y(d[i]));
          else g.lineTo(x + 0.5, y(d[i]));
        }
      } else {
        // Several samples per pixel: a vertical line from the lowest to the highest.
        for (x = 0; x < w; x++) {
          var a0 = Math.floor(start + x * spp);
          var a1 = Math.max(a0 + 1, Math.floor(start + (x + 1) * spp));
          if (a0 >= d.length) break;
          var mn = Infinity;
          var mx = -Infinity;
          for (var k = a0; k < a1 && k < d.length; k++) {
            if (d[k] < mn) mn = d[k];
            if (d[k] > mx) mx = d[k];
          }
          g.moveTo(x + 0.5, y(mx));
          g.lineTo(x + 0.5, y(mn) + 1);
        }
      }
      g.stroke();
      if (lanes.length > 1) {
        g.fillStyle = muted;
        g.fillText(li ? 'R' : 'L', 4, li * laneH + 12);
      }
    });
    g.fillStyle = muted;
    var top = formatValue(hi);
    var bottom = formatValue(lo);
    g.fillText(top, w - g.measureText(top).width - 4, 11);
    g.fillText(bottom, w - g.measureText(bottom).width - 4, h - 4);
  }

  /** The Recorder scope in the side panel. */
  function drawSideScope() {
    var cv = document.getElementById('scope');
    if (!cv) return;
    var sig = lastTaps ? lastTaps[E.getRecorder(patch).id] : null;
    drawSignal(cv, sig, 0, Math.max(1, sigLength(sig)) / cv.width, true);
  }

  // ------------------------------------------------------------ scope windows

  var scopes = [];
  var activeScope = null;

  function openScope(id) {
    var existing = scopes.filter(function (s) { return s.id === id; })[0];
    if (existing) {
      activeScope = existing;
      existing.el.focus();
      return existing;
    }
    if (!E.getComponent(patch, id)) return null;
    var s = { id: id, zoom: 0, fixed: false };
    var win = el('section', { class: 'scope-win', tabindex: '-1', role: 'dialog', 'aria-label': 'Scope' });
    win.dataset.id = id;
    var head = el('header', { class: 'scope-head' });
    var title = el('span', { class: 'scope-title' });
    head.appendChild(title);
    var tools = el('span', { class: 'scope-tools' });
    var zoomLabel = el('span', { class: 'zoom-label' }, 'Fit');
    var scale = el('select', { class: 'scale', 'aria-label': 'Scale', title: 'Vertical scale' });
    scale.appendChild(el('option', { value: 'auto' }, 'Auto'));
    scale.appendChild(el('option', { value: 'fixed' }, '±1'));
    scale.addEventListener('change', function () {
      s.fixed = scale.value === 'fixed';
      redrawScope(s);
    });
    [
      button('−', function () { zoomScope(s, -1); }, { class: 'zoom-out', title: 'Zoom out (Ctrl+O)', 'aria-label': 'Zoom out' }),
      zoomLabel,
      button('+', function () { zoomScope(s, 1); }, { class: 'zoom-in', title: 'Zoom in (Ctrl+I)', 'aria-label': 'Zoom in' }),
      scale,
      button('PNG', function () {
        s.cv.toBlob(function (blob) {
          if (blob) downloadBlob(blob, 'image/png', safeName(scopeName(s), 'scope') + '-scope.png');
        });
      }, { class: 'png', title: 'Export as PNG' }),
      button('×', function () { closeScope(s); }, { class: 'close', title: 'Close', 'aria-label': 'Close scope' })
    ].forEach(function (n) { tools.appendChild(n); });
    head.appendChild(tools);
    win.appendChild(head);
    var cv = el('canvas', { class: 'scope-canvas', width: '400', height: '140' });
    win.appendChild(cv);
    var scroll = el('div', { class: 'scope-scroll' });
    var spacer = el('div', { class: 'scope-spacer' });
    scroll.appendChild(spacer);
    win.appendChild(scroll);
    var msg = el('div', { class: 'scope-msg hint' });
    win.appendChild(msg);
    scroll.addEventListener('scroll', function () { redrawScope(s); });
    win.addEventListener('pointerdown', function () { activeScope = s; });
    win.addEventListener('focusin', function () { activeScope = s; });
    win.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeScope(s);
    });
    s.el = win;
    s.cv = cv;
    s.scroll = scroll;
    s.spacer = spacer;
    s.title = title;
    s.zoomLabel = zoomLabel;
    s.msg = msg;
    var k = scopes.length % 6;
    document.body.appendChild(win);
    win.style.left = Math.max(8, window.innerWidth - win.offsetWidth - 16 - k * 24) + 'px';
    win.style.top = Math.max(8, Math.min(window.innerHeight - win.offsetHeight - 8, 110 + k * 24)) + 'px';
    makeDraggable(win, head);
    scopes.push(s);
    activeScope = s;
    redrawScope(s);
    win.focus();
    return s;
  }

  function makeDraggable(win, handle) {
    handle.addEventListener('pointerdown', function (e) {
      if (e.target !== handle && e.target.className !== 'scope-title') return;
      e.preventDefault();
      var sx = e.clientX;
      var sy = e.clientY;
      var ox = win.offsetLeft;
      var oy = win.offsetTop;
      handle.setPointerCapture(e.pointerId);
      function move(ev) {
        win.style.left = Math.max(0, Math.min(window.innerWidth - 60, ox + ev.clientX - sx)) + 'px';
        win.style.top = Math.max(0, Math.min(window.innerHeight - 30, oy + ev.clientY - sy)) + 'px';
      }
      function up() {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
        handle.removeEventListener('pointercancel', up);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  }

  function scopeName(s) {
    var c = E.getComponent(patch, s.id);
    return c ? c.name : s.id;
  }

  function syncScopeTitle(s) {
    var c = E.getComponent(patch, s.id);
    s.title.textContent = c ? c.name + (isStereoOut(c) ? ' (stereo)' : '') : s.id;
    s.el.setAttribute('aria-label', 'Scope: ' + s.title.textContent);
  }

  function closeScope(s) {
    s.el.remove();
    scopes = scopes.filter(function (x) { return x !== s; });
    if (activeScope === s) activeScope = scopes[scopes.length - 1] || null;
  }

  function closeAllScopes() {
    scopes.slice().forEach(closeScope);
  }

  /** After a patch edit: close scopes of deleted components and refresh names. */
  function syncScopes() {
    scopes.slice().forEach(function (s) {
      if (!E.getComponent(patch, s.id)) closeScope(s);
      else syncScopeTitle(s);
    });
  }

  function scopeGeometry(s) {
    var sig = lastTaps ? lastTaps[s.id] : null;
    var n = sigLength(sig);
    var w = s.cv.width;
    var fit = Math.max(n / w, 1e-9);
    // Each zoom step halves the samples per pixel, from fit-width down to 1:1.
    var spp = fit > 1 ? Math.max(1, fit / Math.pow(2, s.zoom)) : fit;
    return { sig: sig, n: n, w: w, fit: fit, spp: spp };
  }

  function zoomScope(s, dir) {
    var g = scopeGeometry(s);
    if (!g.sig) return;
    var center = ((s.scroll.hidden ? 0 : s.scroll.scrollLeft) + g.w / 2) * g.spp;
    if (dir > 0 && g.spp > 1) s.zoom++;
    else if (dir < 0 && s.zoom > 0) s.zoom--;
    else return;
    redrawScope(s, Math.max(0, center / scopeGeometry(s).spp - g.w / 2));
  }

  function redrawScope(s, scrollTo) {
    syncScopeTitle(s);
    var width = Math.max(100, Math.round(s.cv.clientWidth || 400));
    if (s.cv.width !== width) s.cv.width = width;
    var g = scopeGeometry(s);
    if (!g.sig) {
      drawSignal(s.cv, null, 0, 1, true);
      s.spacer.style.width = '0px';
      s.scroll.hidden = true;
      s.msg.textContent = lastTaps ? 'Not part of the last sound: connect it toward the Recorder and Create again.' : 'Press Create to see this signal.';
      s.zoomLabel.textContent = 'Fit';
      s.el.removeAttribute('data-samples');
      return;
    }
    var total = Math.ceil(g.n / g.spp);
    s.spacer.style.width = total + 'px';
    s.scroll.hidden = total <= g.w + 1;
    if (scrollTo !== undefined && !s.scroll.hidden) s.scroll.scrollLeft = scrollTo;
    var start = s.scroll.hidden ? 0 : s.scroll.scrollLeft * g.spp;
    drawSignal(s.cv, g.sig, start, g.spp, s.fixed);
    s.zoomLabel.textContent = s.zoom === 0 ? 'Fit' : g.spp <= 1 ? '1:1' : '×' + Math.pow(2, s.zoom);
    s.msg.textContent = g.n + ' samples' + (E.isStereo(g.sig) ? ', stereo' : '');
    s.el.setAttribute('data-samples', String(g.n));
  }

  // ------------------------------------------------------------ sound

  var renderCount = 0;
  var latestRender = null; // kept after edits, unlike lastRender
  var previousRender = null;

  function create() {
    try {
      var t0 = performance.now();
      lastRender = E.render(patch, { taps: true });
      var ms = Math.round(performance.now() - t0);
      lastTaps = lastRender.taps;
      previousRender = latestRender;
      latestRender = lastRender;
      prevBtn.disabled = !previousRender;
      renderCount++;
      var msg = 'Peak ' + lastRender.peak.toFixed(3) + ' (' + ms + ' ms)';
      if (lastRender.peak === 0) {
        setStatus(msg + '. The sound is silent.', true);
      } else if (lastRender.suggestedVolume !== null) {
        setStatus(msg + '. Try Recorder volume ' + lastRender.suggestedVolume + '.', true);
      } else {
        setStatus(msg);
      }
      playBtn.disabled = false;
      exportBtn.disabled = false;
      drawSideScope();
      scopes.forEach(function (s) {
        redrawScope(s);
        s.el.setAttribute('data-render', String(renderCount));
      });
      return true;
    } catch (err) {
      setStatus('Could not create the sound: ' + err.message, true);
      return false;
    }
  }

  var playing = null;
  var loopBox = document.getElementById('loop');
  var stopBtn = document.getElementById('stop');
  var prevBtn = document.getElementById('play-prev');

  function stopPlayback() {
    var node = playing;
    playing = null;
    stopBtn.disabled = true;
    if (node) {
      try { node.stop(); } catch (e) { /* already stopped */ }
    }
  }

  /** Plays a render, replacing whatever is playing. With Loop ticked it repeats until Stop. */
  function playRender(r) {
    if (!r) return;
    // Created on first use: browsers only allow audio after a user gesture.
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    stopPlayback();
    var chans = r.channels;
    var buffer = audioCtx.createBuffer(chans.length, chans[0].length, r.sampleRate);
    chans.forEach(function (ch, c) {
      var data = buffer.getChannelData(c);
      for (var i = 0; i < data.length; i++) data[i] = Math.max(-1, Math.min(1, ch[i]));
    });
    var node = audioCtx.createBufferSource();
    node.buffer = buffer;
    node.loop = loopBox.checked;
    node.connect(audioCtx.destination);
    node.onended = function () {
      if (playing === node) stopPlayback();
    };
    playing = node;
    stopBtn.disabled = false;
    node.start();
  }

  function play() {
    playRender(lastRender);
  }

  stopBtn.addEventListener('click', stopPlayback);
  // Play previous: the sound created before the latest one, to compare an edit (A/B).
  prevBtn.addEventListener('click', function () {
    playRender(previousRender);
    setStatus('Playing the previous sound');
  });
  loopBox.addEventListener('change', function () {
    if (playing) playing.loop = loopBox.checked;
  });

  function downloadBlob(data, type, filename) {
    var url = URL.createObjectURL(data instanceof Blob ? data : new Blob([data], { type: type }));
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  createBtn.addEventListener('click', create);
  document.getElementById('create-play').addEventListener('click', function () {
    if (create()) play();
  });
  playBtn.addEventListener('click', play);

  // ------------------------------------------------------------ export

  var MP3_URL = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
  // Subresource Integrity: the browser refuses the file if the CDN ever serves different bytes.
  var MP3_INTEGRITY = 'sha384-xuasJXVcyv3hZq0eYpelEkBC8l4yufatZXDsKuyCU2rqfhDCb+ftuE/mSfZAteiK';
  var MP3_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000];
  var OGG_TYPE = 'audio/ogg;codecs=opus';
  var oggSupported = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(OGG_TYPE);

  if (!oggSupported) {
    var oggOption = formatSelect.querySelector('option[value="ogg"]');
    oggOption.disabled = true;
    oggOption.textContent += ' (unsupported)';
    oggOption.title = 'This browser cannot encode Ogg Opus';
  }

  function loadScript(url, integrity) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.integrity = integrity;
      s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('could not load the MP3 encoder (are you offline?)')); };
      document.head.appendChild(s);
    });
  }

  function toInt16(samples) {
    var out = new Int16Array(samples.length);
    for (var i = 0; i < samples.length; i++) {
      var s = Math.max(-1, Math.min(1, samples[i]));
      out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return out;
  }

  function encodeMp3(r) {
    if (MP3_RATES.indexOf(r.sampleRate) < 0) {
      return Promise.reject(new Error('MP3 needs one of these sample rates: ' + MP3_RATES.join(', ')));
    }
    var ready = window.lamejs ? Promise.resolve() : loadScript(MP3_URL, MP3_INTEGRITY);
    return ready.then(function () {
      var stereo = r.channels.length === 2;
      var enc = new window.lamejs.Mp3Encoder(r.channels.length, r.sampleRate, 128);
      var pcm = toInt16(r.channels[0]);
      var pcmR = stereo ? toInt16(r.channels[1]) : null;
      var chunks = [];
      for (var i = 0; i < pcm.length; i += 1152) {
        var buf = stereo
          ? enc.encodeBuffer(pcm.subarray(i, i + 1152), pcmR.subarray(i, i + 1152))
          : enc.encodeBuffer(pcm.subarray(i, i + 1152));
        if (buf.length) chunks.push(new Uint8Array(buf));
      }
      var end = enc.flush();
      if (end.length) chunks.push(new Uint8Array(end));
      return new Blob(chunks, { type: 'audio/mpeg' });
    });
  }

  // The browser's own Ogg Opus encoder only records in real time, so this plays the
  // sound silently into a recorder and takes as long as the sound itself.
  function encodeOgg(r) {
    var ctx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
    var buffer = ctx.createBuffer(r.channels.length, r.channels[0].length, r.sampleRate);
    r.channels.forEach(function (ch, c) { buffer.getChannelData(c).set(ch); });
    var src = ctx.createBufferSource();
    src.buffer = buffer;
    var dest = ctx.createMediaStreamDestination();
    src.connect(dest);
    var rec = new MediaRecorder(dest.stream, { mimeType: OGG_TYPE });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
    return new Promise(function (resolve) {
      rec.onstop = function () {
        ctx.close();
        resolve(new Blob(chunks, { type: 'audio/ogg' }));
      };
      src.onended = function () { setTimeout(function () { rec.stop(); }, 100); };
      rec.start();
      src.start();
    });
  }

  exportBtn.addEventListener('click', function () {
    var r = lastRender;
    if (!r) return;
    var format = formatSelect.value;
    var job;
    if (format === 'wav') job = Promise.resolve(new Blob([window.QuackWav.encodeWav(r.channels, r.sampleRate, r.bits)], { type: 'audio/wav' }));
    else if (format === 'flac') job = Promise.resolve(new Blob([window.QuackFlac.encodeFlac(r.channels, r.sampleRate, r.bits)], { type: 'audio/flac' }));
    else if (format === 'mp3') job = encodeMp3(r);
    else job = encodeOgg(r);
    exportBtn.disabled = true;
    setStatus('Exporting ' + format.toUpperCase() + '…');
    job.then(function (blob) {
      var name = safeName(E.getRecorder(patch).props.filename || 'segway', 'segway') + '.' + format;
      downloadBlob(blob, blob.type, name);
      setStatus('Exported ' + name);
    }).catch(function (err) {
      setStatus('Could not export ' + format.toUpperCase() + ': ' + err.message, true);
    }).then(function () {
      exportBtn.disabled = !lastRender;
    });
  });

  // ------------------------------------------------------------ variations

  var VARY_KEY = 'quack.varyAmount';
  function varyAmount() {
    var v = Number(storeGet(VARY_KEY));
    return isFinite(v) && v > 0 ? v : 5;
  }

  /** Applies one random variation to the current patch (undo brings the original back). */
  document.getElementById('vary').addEventListener('click', function () {
    var amount = varyAmount();
    patch = window.QuackVariations.vary(patch, { amount: amount / 100 });
    history.seal();
    changed();
    history.seal();
    setStatus('Varied numbers by up to ±' + amount + '%. Undo to go back.');
  });

  /** Renders several variations and downloads them as WAV files in one .zip. */
  document.getElementById('variations').addEventListener('click', function () {
    showForm('Export variations', [
      E.num('count', 'How many', 8, { min: 1, max: 100, step: 1 }),
      E.num('amount', 'Vary numbers by up to ± (%)', varyAmount(), { min: 0, max: 100 })
    ], function (v) {
      var count = Math.max(1, Math.min(100, Math.round(Number(v.count) || 1)));
      var amount = Math.max(0, Number(v.amount) || 0);
      storeSet(VARY_KEY, String(amount));
      var base = safeName(E.getRecorder(patch).props.filename || 'segway', 'segway');
      var files = [];
      try {
        for (var i = 0; i < count; i++) {
          var r = E.render(window.QuackVariations.vary(patch, { amount: amount / 100 }));
          var n = String(i + 1);
          while (n.length < String(count).length) n = '0' + n;
          files.push({ name: base + '-' + n + '.wav', data: window.QuackWav.encodeWav(r.channels, r.sampleRate, r.bits) });
        }
      } catch (err) {
        setStatus('Could not create the variations: ' + err.message, true);
        return;
      }
      downloadBlob(new Blob([window.QuackZip.zip(files)], { type: 'application/zip' }), 'application/zip', base + '-variations.zip');
      setStatus('Exported ' + count + ' variations as ' + base + '-variations.zip');
    });
  });

  // ------------------------------------------------------------ files

  document.getElementById('new').addEventListener('click', function () {
    setPatch(E.createPatch());
    setStatus('');
  });
  document.getElementById('save').addEventListener('click', function () {
    downloadBlob(E.serialize(patch), 'application/json', 'patch.json');
  });
  var fileInput = document.getElementById('file');
  document.getElementById('open').addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', function () {
    var f = fileInput.files[0];
    if (!f) return;
    // Patch maps saved by the original Quack (.pm) are converted on the way in.
    var isPm = /\.pm$/i.test(f.name);
    (isPm ? f.arrayBuffer() : f.text()).then(function (data) {
      var warnings = [];
      if (isPm) {
        var imported = window.QuackPmImport.importPm(data);
        warnings = imported.warnings;
        data = imported.patch;
      }
      setPatch(E.parse(data));
      setStatus((isPm ? 'Imported ' : 'Opened ') + f.name + (warnings.length ? '. ' + warnings.join('. ') : ''));
    }).catch(function (err) {
      setStatus('Could not open ' + f.name + ': ' + err.message, true);
    });
    fileInput.value = '';
  });

  // Canvases use the theme colors, so redraw them when the system theme changes.
  if (window.matchMedia) {
    var scheme = window.matchMedia('(prefers-color-scheme: dark)');
    var redrawCanvases = function () {
      drawSideScope();
      scopes.forEach(function (s) { redrawScope(s); });
    };
    if (scheme.addEventListener) scheme.addEventListener('change', redrawCanvases);
    else if (scheme.addListener) scheme.addListener(redrawCanvases);
  }

  window.addEventListener('resize', function () {
    drawWires();
    scopes.forEach(function (s) { redrawScope(s); });
  });

  // A small hook for tests and debugging, e.g. redraw after registering a component.
  window.QuackApp = {
    getPatch: function () { return patch; },
    setPatch: setPatch,
    select: function (id) {
      selectedId = id;
      changed();
    },
    redraw: changed
  };

  autosave(); // the starting point for undo
  drawBoard();
  drawPanel();
  drawSideScope();
})();
