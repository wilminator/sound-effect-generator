/*
 * SEGway expression language (Math Function and Wave Function).
 * compile(text, allowedVars) parses once into a tree of closures and returns fn(vars),
 * where vars is an object of single-letter variables (letters not set count as 0).
 * No eval and no new Function: user text is never executed as JavaScript.
 *
 * Grammar, loosest to tightest binding:
 *   ||   &&   == !=   < <= > >=   + -   * /   unary - + !   ^ (right-associative)
 * so -2^2 = -4 and 2^3^2 = 2^9. The exponent may itself be unary: 2^-1 = 0.5.
 * Comparisons and logic give 1 or 0; for ! && || a value is "true" when >= 0.5.
 * Syntax errors throw at compile time (message names the problem and the 1-based
 * character position, also err.pos). Math errors throw while evaluating.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.QuackExpr = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function mathError(msg) {
    var e = new Error(msg);
    e.mathError = true;
    return e;
  }

  // Each function maps one number to one number; domain problems throw.
  var FUNCS = {
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    asin: function (x) { if (x < -1 || x > 1) throw mathError('asin of ' + x + ' (argument must be between -1 and 1)'); return Math.asin(x); },
    acos: function (x) { if (x < -1 || x > 1) throw mathError('acos of ' + x + ' (argument must be between -1 and 1)'); return Math.acos(x); },
    atan: Math.atan,
    ln: function (x) { if (x <= 0) throw mathError('ln of ' + x + ' (argument must be greater than 0)'); return Math.log(x); },
    exp: Math.exp,
    log: function (x) { if (x <= 0) throw mathError('log of ' + x + ' (argument must be greater than 0)'); return Math.log(x) / Math.LN10; },
    abs: Math.abs,
    sign: function (x) { return x > 0 ? 1 : x < 0 ? -1 : 0; },
    floor: Math.floor,
    frac: function (x) { return x - Math.floor(x); },
    sinh: function (x) { return (Math.exp(x) - Math.exp(-x)) / 2; },
    cosh: function (x) { return (Math.exp(x) + Math.exp(-x)) / 2; },
    tanh: function (x) {
      if (x > 20) return 1;
      if (x < -20) return -1;
      var a = Math.exp(2 * x);
      return (a - 1) / (a + 1);
    },
    asinh: function (x) { return Math.log(x + Math.sqrt(x * x + 1)); },
    acosh: function (x) { if (x < 1) throw mathError('acosh of ' + x + ' (argument must be at least 1)'); return Math.log(x + Math.sqrt(x * x - 1)); },
    atanh: function (x) { if (x <= -1 || x >= 1) throw mathError('atanh of ' + x + ' (argument must be between -1 and 1, exclusive)'); return 0.5 * Math.log((1 + x) / (1 - x)); }
  };

  function syntaxError(msg, pos) {
    var e = new Error(msg + ' at position ' + pos);
    e.pos = pos;
    return e;
  }

  function tokenize(text) {
    var toks = [];
    var i = 0;
    var n = text.length;
    while (i < n) {
      var ch = text.charAt(i);
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
      var start = i;
      if ((ch >= '0' && ch <= '9') || ch === '.') {
        var digits = 0;
        while (i < n && text.charAt(i) >= '0' && text.charAt(i) <= '9') { i++; digits++; }
        if (i < n && text.charAt(i) === '.') {
          i++;
          while (i < n && text.charAt(i) >= '0' && text.charAt(i) <= '9') { i++; digits++; }
        }
        if (digits === 0) throw syntaxError('Invalid number "."', start + 1);
        if (i < n && text.charAt(i) === '.') throw syntaxError('Invalid number (second decimal point)', i + 1);
        var c2 = i < n ? text.charAt(i) : '';
        if ((c2 >= 'a' && c2 <= 'z') || (c2 >= 'A' && c2 <= 'Z')) {
          throw syntaxError('Unexpected letter "' + c2 + '" after a number (scientific notation and implicit multiplication are not supported)', i + 1);
        }
        toks.push({ t: 'num', v: parseFloat(text.slice(start, i)), pos: start + 1 });
        continue;
      }
      if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        while (i < n && /[A-Za-z0-9_]/.test(text.charAt(i))) i++;
        toks.push({ t: 'id', v: text.slice(start, i), pos: start + 1 });
        continue;
      }
      var two = text.substr(i, 2);
      if (two === '==' || two === '!=' || two === '<=' || two === '>=' || two === '&&' || two === '||') {
        toks.push({ t: 'op', v: two, pos: start + 1 });
        i += 2;
        continue;
      }
      if ('+-*/^()<>!'.indexOf(ch) >= 0) {
        toks.push({ t: 'op', v: ch, pos: start + 1 });
        i++;
        continue;
      }
      if (ch === '&' || ch === '|' || ch === '=') throw syntaxError('Unexpected "' + ch + '" (did you mean "' + ch + ch + '"?)', start + 1);
      if (ch === ',') throw syntaxError('Unexpected "," (functions take exactly one argument)', start + 1);
      if (ch === ';') throw syntaxError('Unexpected ";" (only a single expression is allowed)', start + 1);
      throw syntaxError('Unexpected character "' + ch + '"', start + 1);
    }
    toks.push({ t: 'end', v: '', pos: n + 1 });
    return toks;
  }

  function finite(v) {
    if (v !== v) throw mathError('Result is not a number (NaN)');
    if (v === Infinity || v === -Infinity) throw mathError('Result is infinite');
    return v;
  }

  function parse(text, allowedVars) {
    var allowed = {};
    var list = typeof allowedVars === 'string' ? allowedVars.split('') : (allowedVars || []);
    for (var k = 0; k < list.length; k++) allowed[list[k]] = true;

    var toks = tokenize(String(text));
    var at = 0;

    function peek() { return toks[at]; }
    function isOp(v) { var t = toks[at]; return t.t === 'op' && t.v === v; }
    function describe(t) { return t.t === 'end' ? 'end of expression' : '"' + t.v + '"'; }

    function expr() { return orExpr(); }

    function orExpr() {
      var l = andExpr();
      while (isOp('||')) {
        at++;
        l = (function (a, b) { return function (v) { return (a(v) >= 0.5 || b(v) >= 0.5) ? 1 : 0; }; })(l, andExpr());
      }
      return l;
    }

    function andExpr() {
      var l = eqExpr();
      while (isOp('&&')) {
        at++;
        l = (function (a, b) { return function (v) { return (a(v) >= 0.5 && b(v) >= 0.5) ? 1 : 0; }; })(l, eqExpr());
      }
      return l;
    }

    function eqExpr() {
      var l = relExpr();
      while (isOp('==') || isOp('!=')) {
        var eq = toks[at++].v === '==';
        l = (function (a, b, eq) {
          return eq ? function (v) { return a(v) === b(v) ? 1 : 0; } : function (v) { return a(v) !== b(v) ? 1 : 0; };
        })(l, relExpr(), eq);
      }
      return l;
    }

    function relExpr() {
      var l = addExpr();
      while (isOp('<') || isOp('<=') || isOp('>') || isOp('>=')) {
        var op = toks[at++].v;
        var r = addExpr();
        l = (function (a, b, op) {
          if (op === '<') return function (v) { return a(v) < b(v) ? 1 : 0; };
          if (op === '<=') return function (v) { return a(v) <= b(v) ? 1 : 0; };
          if (op === '>') return function (v) { return a(v) > b(v) ? 1 : 0; };
          return function (v) { return a(v) >= b(v) ? 1 : 0; };
        })(l, r, op);
      }
      return l;
    }

    function addExpr() {
      var l = mulExpr();
      while (isOp('+') || isOp('-')) {
        var plus = toks[at++].v === '+';
        l = (function (a, b, plus) {
          return plus ? function (v) { return a(v) + b(v); } : function (v) { return a(v) - b(v); };
        })(l, mulExpr(), plus);
      }
      return l;
    }

    function mulExpr() {
      var l = unary();
      while (isOp('*') || isOp('/')) {
        var mul = toks[at++].v === '*';
        l = (function (a, b, mul) {
          if (mul) return function (v) { return a(v) * b(v); };
          return function (v) {
            var d = b(v);
            if (d === 0) throw mathError('Division by zero');
            return a(v) / d;
          };
        })(l, unary(), mul);
      }
      return l;
    }

    function unary() {
      if (isOp('-')) { at++; return (function (a) { return function (v) { return -a(v); }; })(unary()); }
      if (isOp('+')) { at++; return unary(); }
      if (isOp('!')) { at++; return (function (a) { return function (v) { return a(v) >= 0.5 ? 0 : 1; }; })(unary()); }
      return power();
    }

    // ^ is right-associative and binds tighter than unary minus on its left.
    function power() {
      var base = primary();
      if (isOp('^')) {
        at++;
        var ex = unary();
        return function (v) {
          var b = base(v);
          var e = ex(v);
          if (b === 0 && e < 0) throw mathError('Division by zero (0 raised to a negative power)');
          var r = Math.pow(b, e);
          if (r !== r) throw mathError('Result is not a number (' + b + ' ^ ' + e + ')');
          if (r === Infinity || r === -Infinity) throw mathError('Result is infinite (' + b + ' ^ ' + e + ')');
          return r;
        };
      }
      return base;
    }

    function primary() {
      var t = peek();
      if (t.t === 'num') {
        at++;
        var val = t.v;
        return function () { return val; };
      }
      if (t.t === 'id') {
        at++;
        var name = t.v;
        if (isOp('(')) {
          if (!Object.prototype.hasOwnProperty.call(FUNCS, name)) throw syntaxError('Unknown function "' + name + '"', t.pos);
          at++;
          if (isOp(')')) throw syntaxError('Function "' + name + '" needs an argument', peek().pos);
          var arg = expr();
          if (!isOp(')')) throw syntaxError('Expected ")" but found ' + describe(peek()), peek().pos);
          at++;
          var f = FUNCS[name];
          return function (v) { return finite(f(arg(v))); };
        }
        if (name === 'pi') return function () { return Math.PI; };
        if (Object.prototype.hasOwnProperty.call(FUNCS, name)) throw syntaxError('Function "' + name + '" must be followed by "("', peek().pos);
        if (name.length !== 1) throw syntaxError('Unknown name "' + name + '" (variables are single letters)', t.pos);
        if (!allowed[name]) throw syntaxError('Unknown variable "' + name + '"', t.pos);
        return function (v) { var x = v[name]; return x === undefined ? 0 : x; };
      }
      if (isOp('(')) {
        at++;
        var inner = expr();
        if (!isOp(')')) throw syntaxError('Expected ")" but found ' + describe(peek()), peek().pos);
        at++;
        return inner;
      }
      if (t.t === 'end') throw syntaxError('Unexpected end of expression', t.pos);
      throw syntaxError('Unexpected ' + describe(t), t.pos);
    }

    var tree = expr();
    if (peek().t !== 'end') throw syntaxError('Unexpected ' + describe(peek()), peek().pos);
    return tree;
  }

  /** Compiles text into fn(vars) -> number. Throws on syntax errors. */
  function compile(text, allowedVars) {
    var tree = parse(text, allowedVars);
    return function (vars) { return finite(tree(vars)); };
  }

  /** Returns null when text is a valid expression, otherwise the error message. */
  function check(text, allowedVars) {
    try {
      parse(text, allowedVars);
      return null;
    } catch (e) {
      return e.message;
    }
  }

  return { compile: compile, check: check, FUNCTIONS: Object.keys(FUNCS) };
});
