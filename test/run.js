// Runs the test files under the given folders (default: all of test/). Node only expands
// wildcards in `node --test` from version 21, so the files are listed here instead.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function find(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return find(p);
    return e.name.endsWith('.test.js') ? [p] : [];
  });
}

const dirs = process.argv.slice(2);
const files = (dirs.length ? dirs : [__dirname]).flatMap((d) => find(path.resolve(d))).sort();
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status === null ? 1 : r.status);
