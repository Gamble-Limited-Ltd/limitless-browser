// CL-15 scanner parity: node --test tests/unit/
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const { tokRewrite } = require(path.join(root, 'app/tokrw.js'));
const load = (f) => { const c = {}; c.window = c; c.self = c; vm.runInNewContext(fs.readFileSync(path.join(root, f), 'utf8'), c); return c; };
const acorn = load('vendor/acorn/8.14.0/acorn.min.js').acorn;
const meriyah = load('vendor/meriyah/7.4.2/meriyah.umd.min.js').meriyah;
const m = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8');
const a = m.indexOf('function rewriteLocationRefs(src, imp) {'), b = m.indexOf('// ── Worker rewriter (0.2.0)');
const mk = (mer) => new Function('acorn', 'meriyah', m.slice(a, b) + '\nreturn rewriteLocationRefs;')(acorn, mer);
const ast = mk(undefined), astM = mk(meriyah);

// output must equal the AST path, or be null (bail)
const same = (src, imp) => {
  const out = tokRewrite(src, imp, {});
  if (out === null) return null;
  assert.equal(out, ast(src, imp), `acorn path differs for ${JSON.stringify(src)} imp=${imp}`);
  assert.equal(out, astM(src, imp), `meriyah path differs for ${JSON.stringify(src)} imp=${imp}`);
  return out;
};
const both = (src) => { for (const imp of [false, true]) same(src, imp); };

test('EOF never loops (every token kind), with a timeout guard', () => {
  const cases = ['a = location', 'location', 'a.location', 'a?.location', 'a = location.', 'a = location?.', 'import', 'import(', 'import(x', 'location; import',
    'location "abc', 'location `abc', 'location `a${b', 'location /ab', 'location /* x', 'location = /re', 'location \\u0061', 'location \\', 'location "x\\', 'location 1e', 'location 0x', 'location .', 'location ?', 'location <!-', 'location #'];


  const code = `const { tokRewrite } = require(${JSON.stringify(path.join(root, 'app/tokrw.js'))}); for (const c of ${JSON.stringify(cases)}) for (const imp of [false, true]) tokRewrite(c, imp, {}); 'ok'`;
  assert.equal(vm.runInNewContext(code, { require }, { timeout: 5000 }), 'ok');
  for (const c of cases) both(c);
});

test('gap 1: a script that does not tokenize or balance is never rewritten', () => {
  for (const s of ['a.location; "unterminated', 'a.location; `tpl', 'a.location; /* c', 'a.location; x = /re', 'a.location; f(', 'a.location; }', 'a.location; ]', 'a.location; (]', 'a.location; {)', 'a.location; `${x`']) {
    assert.equal(tokRewrite(s, false, {}), null, s);
    assert.equal(ast(s, false), s);
  }
});

test('gap 2: declared heuristics bail when unsure', () => {
  const t = (s) => both(s);
  assert.equal(tokRewrite('var a = 1\nb = 2, location = 3\nx.location', false, {}), null);   // ASI: not a declaration list
  t('var a = 1,\n location = 2; x.location');
  t('function f(a, location) { return location.x } y.location');
  t('(a, location) => location.x; y.location');
  t('foo(a, location)\n{ }; y.location');
  t('catch1: try {} catch (location) { location.x } y.location');
  t('for (var i = 0, location = 1; i < 2; i++); y.location');
  t('class A { get location() { return 1 } m() { return this.location } }');
  t('x = {a, location}; y.location');
  t('let {location} = q; y.location');
  t('f(...location); y.location'); t('x = {...location, a: 1}'); t('({...location, a} = o)'); t('f({a: {...location, b}})');
  t('function g(...location) {} y.location');
});

test('gap 4: [ after ) at statement start', () => {
  both('if (a) ["location"].x; b.location');
  both('if (a)\n["location"].length; b.location');
  both('a(b)["location"]; c["location"]');
  both('x = ["location"]; y = {["location"]: 1}');
  both('while (a) [location].x');
  both('for (;;) (a).location');
  both('if (a) (b, c).location');
});

test('hand cases', () => {
  for (const s of [
    'x = {location: 1, a: a.location}', 'class K { location = 1; m() { return a.location } }', 'x = {location}; a.location', 'with (o) { location.x }',
    'x = (1) / 2 / location.href', 'x = a++ / 2 / location.x', 'if (a) /re/.test(location.x)', 'x = {} / 2 / location.x', 'y = b ? {a:1} / c : d.location',
    'function f() {} /location/.test(s)', 'return /a/.test(location.hash)', 'x = a.return / 2 / location.x', 'typeof location !== "undefined" && location.x',
    'x = `a${`b${location.x}`}c${a.location}`', '#!/usr/bin/env node\nlocation.x', 'x = typeof location', 'y = a ? location : b', 'f(location)', 'x = location',
    'a.b.c().location', 'a?.b.location', 'a?.b().location', '(a, b).location', '(a).location', '((a)).location', '(a?.b).location', '(0, f)().location', 'new A().location', 'new a.B().location',
    '[1].location', '"s".location', 'a[0].location', 'a?.["location"]', 'a["loc" + "ation"]', "a['locat\\u0069on']", 'x = {get location() { return 1 }}', 'x = {async location() {}}',
    'import("./m.js"); a.import(x); x = {import(y) {}}', 'import(a, b)', 'import(\n"x")', 'f(typeof location)', 'a = b\n/location/c', 'x = a.get(t)?.location.id', 'a.of(1).location',
  ]) both(s);
});

test('import( with imp on and off', () => {
  assert.equal(same('import("./a.js")', false), 'import("./a.js")');
  assert.equal(same('import("./a.js")', true), '__lbImport("./a.js","__LB_IMU__")');
  assert.equal(same('var location = 1; import(x)', true), 'var location = 1; __lbImport(x,"__LB_IMU__")');
});

const corpus = path.join(process.env.HOME || '', '.cache/limitless-fixtures/bundles');
test('golden corpus parity', { skip: !fs.existsSync(corpus), timeout: 900000 }, () => {
  let bails = 0, files = 0;
  for (const f of fs.readdirSync(corpus)) {
    if (!f.endsWith('.js')) continue;
    const s = fs.readFileSync(path.join(corpus, f), 'utf8');
    if (s.length > 9e6) continue;
    files++;
    for (const imp of [false, true]) { if (same(s, imp) === null) bails++; }
  }
  assert.ok(files > 0);
  assert.ok(bails <= files * 0.2, `bail rate too high: ${bails}`);
});

test('fuzz parity (fixed seed)', () => {
  const log = console.log; let out = '';
  console.log = (...x) => { out += x.join(' ') + '\n'; };
  try { require(path.join(root, 'tools/cl15/fuzz.cjs'))(ast, tokRewrite, 1000, acorn, astM); } finally { console.log = log; }
  assert.match(out, /DIFFERENT 0/, out);
});

test('main.js cache key version matches the scanner', () => {
  const { VERSION } = require(path.join(root, 'app/tokrw.js'));
  const m = fs.readFileSync(path.join(root, 'app/main.js'), 'utf8').match(/const LB_TOKRW_V = (\d+);/);
  assert.equal(Number(m[1]), VERSION);
});
