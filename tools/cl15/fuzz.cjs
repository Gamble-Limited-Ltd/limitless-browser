'use strict';
// Small-program fuzz: random statements using `location` in many roles; both rewriters must agree whenever the scanner does not bail.
let seed = 12345; const rnd = n => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed % n; };
const pick = a => a[rnd(a.length)];
const RECV = ['a', 'this', 'window', 'a.b', 'a[0]', 'a.b(c)', 'f(x)(y)', 'a?.b', 'a?.b()', '(a, b)', '(a)', 'new A()', 'new A(x).b', 'new a.B', 'a[b][c]', 'a?.[0]', '[1]', '"s"', '`t${x.location}`', 'a\n.b', 'a /* c */ .b', 'super', 'x.get', 'import.meta', 'function(){}', '{}', 'f(`${g(1)}`)'];
const ACC = ['.location', '?.location', '["location"]', "['location']", '?.["location"]', '["loc" + "ation"]', '["locat\\u0069on"]'];
const BARE = ['location', 'location.href', 'location["x"]', 'f(location)', 'x = location', 'location = 1', 'typeof location', 'var location = 2', 'function g(location) {}', '({ location: 1 })', '({ location })', 'class K { location() {} }', 'class K { static location = 1 }', 'x ? location : y',
  '[location]', '`${location.href}`', 'for (location of z);', 'let {location} = q', 'import("./m.js")', 'import(a, b)', 'a.import(x)', '/location/.test(s)', 'x = "location"; y = \'a.location\'', '// a.location\nz', '/* location */', 'a / b / location', 'a++ / 2 / location', 'x = {location: a.location}', 'lab: location.x', 'if (a) /re/.test(location)'];
module.exports = function (ast, tok, count, acorn, astM) {
  let eq = 0, bail = 0, skip = 0, bad = 0;
  for (let c = 0; c < count; c++) {
    const stmts = [];
    for (let k = 1 + rnd(3); k > 0; k--) stmts.push(rnd(3) ? pick(RECV) + pick(ACC) : pick(BARE));
    const src = 'class Q extends P { m() {\n' + stmts.join(';\n') + ';\n} }';
    for (const imp of [false, true]) {
      let ref;
      const parses = (() => { try { acorn.parse(src, { ecmaVersion: 'latest', allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true, allowImportExportEverywhere: true }); return true; } catch (e) { return false; } })();
      ref = ast(src, imp); const out = tok(src, imp, {});
      if (out === null) { bail++; continue; }
      if (out === ref) { eq++; if (astM && astM(src, imp) !== out) { bad++; if (bad < 6) console.log('FUZZ DIFF vs meriyah\n' + src); } }
      else if (parses === false && ref === src) skip++;   // unparseable: AST leaves it alone
      else { bad++; if (bad < 6) console.log('FUZZ DIFF\n' + src + '\n--ast--\n' + ref + '\n--tok--\n' + out); }
    }
  }
  console.log(`fuzz ${count * 2}: equal ${eq}, bailed ${bail}, unparseable-skipped ${skip}, DIFFERENT ${bad}`);
};
