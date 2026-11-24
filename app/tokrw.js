// CL-15 token-level rewriter (spec docs/1.3/specs/02-client-speed.md CL-15). Loaded by the page and the rewrite Worker as a global
// (LB_tokRewrite, LB_TOKRW_VERSION) and by node via module.exports. tokRewrite(src, imp, stats) returns a string or null (= use the AST path).
(function (root) {
'use strict';
// CL-15 prototype: token-level rewriter, same output as rewriteLocationRefs (app/main.js) or null (= "unsure, use the AST path").
// Standalone; not wired into the app. tokRewrite(src, imp, stats) returns a string, or null when it bails out.
// Soundness rule: a bare `location` token is edited only when it is provably a reference (next token `.`, `?.` or `[`, or an operand
// position after an operator or keyword); a provable binding marks the file declared; everything else bails. Any tokenizer error,
// unbalanced bracket or ambiguous `/` (regex or division) bails too, so a script the AST path cannot parse is never rewritten here.
const VERSION = 2;
const KW = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if ' +
  'import in instanceof let new null return super switch throw true try typeof var void while with yield await static of async get set').split(' '));
// keywords after which `/` starts a regex literal
const RE_AFTER = new Set('return typeof instanceof in of new delete void throw case do else yield await'.split(' '));
const EXPR_KW = new Set('return typeof void delete in instanceof case throw else do'.split(' '));   // an expression starts after these
const BLOCK_KW = new Set('else do try finally'.split(' '));
const OPKW = new Set('typeof void delete return throw case in instanceof new else do'.split(' '));
const EXPR_PUN = new Set([61, 40, 44, 91, 63, 43, 45, 42, 37, 60, 38, 124, 94, 33, 126]);   // = ( , [ ? + - * % < & | ^ ! ~
const OPERAND = new Set([61, 43, 45, 60, 62, 38, 124, 94, 126, 33, 63, 37, 42, 47]);   // punctuation after which a bare identifier is an operand
const BINQ = new Set([43, 45, 42, 47, 37, 60, 62, 38, 124, 94, 63, 33]);   // binary operators that can follow a bare operand inside (
const IDT = 1, PUN = 2, STR = 3, TPL = 4, REG = 5, NUM = 6;
const ID = new Uint8Array(128);
for (let c = 48; c < 58; c++) ID[c] = 2;
for (let c = 65; c < 91; c++) ID[c] = 1;
for (let c = 97; c < 123; c++) ID[c] = 1;
ID[36] = 1; ID[95] = 1;
const isWs = c => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029 || (c >= 0x2000 && c <= 0x200a) || c === 0x3000 || c === 0x1680 || c === 0x202f || c === 0x205f;

const decodeId = t => t.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, a, b) => String.fromCodePoint(parseInt(a || b, 16)));
const ESC = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' };
// value of a string literal token with escapes, null when unsure (octal escapes)
function decodeStr(raw) {
  if (/\\[0-9]/.test(raw)) return null;
  return raw.slice(1, -1).replace(/\\(?:u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g, (m, a, b, c, d) => a || b || c ? String.fromCodePoint(parseInt(a || b || c, 16)) : (d === '\n' || d === '\r' || d === '\u2028' || d === '\u2029') ? '' : ESC[d] !== undefined ? ESC[d] : d);
}
function bail(stats, why, at) { if (stats) { stats.at = at; stats.tokFallback = (stats.tokFallback || 0) + 1; (stats.why = stats.why || {})[why] = (stats.why[why] || 0) + 1; } return null; }

function tokRewrite(src, imp, stats) {
  if (!src || (src.indexOf('location') === -1 && !(imp && /\bimport\s*\(/.test(src)))) return src;
  const n = src.length;
  let K = new Uint8Array(1 << 12), S = new Int32Array(1 << 12), E = new Int32Array(1 << 12), P = new Int32Array(1 << 12), M = new Int32Array(1 << 12), nt = 0;
  const cand = [];   // token indexes of `location` and `import`
  const stk = [], stf = [];   // open bracket token indexes; stf = that opener is the `{` of a template `${`
  function push(k, s, e) {
    if (nt === K.length) {
      const K2 = new Uint8Array(nt * 2); K2.set(K); K = K2;
      const S2 = new Int32Array(nt * 2); S2.set(S); S = S2;
      const E2 = new Int32Array(nt * 2); E2.set(E); E = E2;
      const P2 = new Int32Array(nt * 2); P2.set(P); P = P2;
      const M2 = new Int32Array(nt * 2); M2.set(M); M = M2;
    }
    K[nt] = k; S[nt] = s; E[nt] = e; P[nt] = stk.length ? stk[stk.length - 1] : -1; M[nt] = 0; return nt++;   // P: enclosing opener, M: partner + 1
  }
  const ch = t => (t >= 0 && t < nt && K[t] === PUN && E[t] - S[t] === 1) ? src.charCodeAt(S[t]) : 0;   // single-char punct code
  const isQDot = t => t >= 0 && t < nt && K[t] === PUN && E[t] - S[t] === 2 && src.charCodeAt(S[t]) === 63;
  const isDot = t => ch(t) === 46;
  const word = t => K[t] === IDT ? src.slice(S[t], E[t]) : '';
  const mt = t => M[t] - 1;   // partner of a bracket token, -1 none
  const nl = (a, b) => /[\n\r\u2028\u2029]/.test(src.slice(a, b));
  let i = 0;
  if (src.charCodeAt(0) === 35 && src.charCodeAt(1) === 33) { while (i < n && src.charCodeAt(i) !== 10) i++; }
  // `/` after the last token: 1 regex, 0 division, -1 unsure (the caller bails)
  function slash() {
    if (!nt) return 1;
    const t = nt - 1, k = K[t];
    if (k === PUN) {
      const c = src.charCodeAt(S[t]), len = E[t] - S[t];
      if (c === 93 || (len === 2 && (c === 43 || c === 45))) return 0;   // ] ++ --
      if (c === 41) {
        const o = mt(t), w = o > 0 && K[o - 1] === IDT ? word(o - 1) : '';
        return (w === 'if' || w === 'while' || w === 'for' || w === 'with' || (w === 'await' && o > 1 && word(o - 2) === 'for')) ? 1 : 0;
      }
      if (c === 125) {   // block end (regex), object literal end (division), anything else unsure
        const o = mt(t), p = o - 1;
        if (o <= 0) return 1;
        if (K[p] === PUN) { const cp = ch(p); if (cp === 59 || cp === 125) return 1; if (EXPR_PUN.has(cp)) return 0; return -1; }
        if (K[p] === IDT) { const w = word(p); if (BLOCK_KW.has(w)) return 1; if (EXPR_KW.has(w) || w === 'new') return 0; }
        return -1;
      }
      return 1;
    }
    if (k === IDT) {
      if (isDot(t - 1) || isQDot(t - 1)) return 0;   // a property named like a keyword
      const w = word(t);
      if (w === 'of' || w === 'yield' || w === 'await') return -1;
      return RE_AFTER.has(w) ? 1 : 0;
    }
    return 0;
  }
  function tplChunk() {   // i is after the opening ` or the closing } of a substitution; emits a TPL token; returns false on error
    const s = i;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (c === 92) i += 2;
      else if (c === 96) { i++; push(TPL, s - 1 < 0 ? 0 : s - 1, i); return true; }
      else if (c === 36 && src.charCodeAt(i + 1) === 123) { push(TPL, s - 1, i); stk.push(push(PUN, i + 1, i + 2)); stf.push(true); i += 2; return true; }
      else i++;
    }
    return false;
  }
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c < 128 && ID[c] === 1 || c > 127 && !isWs(c) || c === 35) {   // identifier (or #private)
      const s = i; i++; let esc = false;
      for (;;) { const d = src.charCodeAt(i); if (i < n && (d < 128 ? ID[d] : !isWs(d))) i++; else if (d === 92) { esc = true; i += 2; } else break; }
      if (esc) { if (decodeId(src.slice(s, i)) === 'location') return bail(stats, 'idescape', s); push(IDT, s, i); continue; }   // an escaped name that is not `location` is an ordinary identifier
      const t = push(IDT, s, i); const len = i - s;
      if (len === 8 && src.startsWith('location', s)) cand.push(t);
      else if (len === 6 && imp && src.startsWith('import', s)) cand.push(t);
      continue;
    }
    if (c < 128 && ID[c] === 2) {   // number
      const s = i; i++;
      for (;;) { const d = src.charCodeAt(i); if (d < 128 && ID[d] || d === 46) { i++; } else if ((d === 43 || d === 45) && (src.charCodeAt(i - 1) | 32) === 101 && !/^0[xX]/.test(src.slice(s, s + 2))) i++; else break; }
      push(NUM, s, i); continue;
    }
    switch (c) {
      case 32: case 9: case 10: case 13: case 11: case 12: i++; continue;
      case 34: case 39: {
        const s = i; i++;
        for (;;) { if (i >= n) return bail(stats, 'tokerr', s); const d = src.charCodeAt(i); if (d === 92) i += 2; else if (d === c) { i++; break; } else if (d === 10 || d === 13) return bail(stats, 'tokerr', s); else i++; }
        push(STR, s, i); continue;
      }
      case 96: i++; if (!tplChunk()) return bail(stats, 'tokerr', i); continue;
      case 47: {
        const d = src.charCodeAt(i + 1);
        if (d === 47) { i += 2; while (i < n) { const e = src.charCodeAt(i); if (e === 10 || e === 13 || e === 0x2028 || e === 0x2029) break; i++; } continue; }
        if (d === 42) { const e = src.indexOf('*/', i + 2); if (e < 0) return bail(stats, 'tokerr', i); i = e + 2; continue; }
        const sl = slash();
        if (sl < 0) return bail(stats, 'slash', i);
        if (sl) {
          const s = i; i++; let cls = false;
          for (;;) {
            if (i >= n) return bail(stats, 'tokerr', s);
            const e = src.charCodeAt(i);
            if (e === 10 || e === 13) return bail(stats, 'tokerr', s);
            if (e === 92) i += 2; else if (e === 91) { cls = true; i++; } else if (e === 93) { cls = false; i++; } else if (e === 47 && !cls) { i++; break; } else i++;
          }
          while (i < n) { const e = src.charCodeAt(i); if (e < 128 && ID[e] === 1) i++; else break; }
          push(REG, s, i); continue;
        }
        push(PUN, i, i + 1); i++; continue;
      }
      case 40: case 91: case 123: stk.push(push(PUN, i, i + 1)); stf.push(false); i++; continue;
      case 41: case 93: case 125: {
        const o = stk.pop(), f = stf.pop();
        if (o === undefined || src.charCodeAt(S[o]) !== (c === 41 ? 40 : c === 93 ? 91 : 123)) return bail(stats, 'unbalanced', i);
        const t = push(PUN, i, i + 1); M[t] = o + 1; M[o] = t + 1; i++;
        if (f && !tplChunk()) return bail(stats, 'tokerr', i);
        continue;
      }
      case 46: {
        const d = src.charCodeAt(i + 1);
        if (d === 46 && src.charCodeAt(i + 2) === 46) { push(PUN, i, i + 3); i += 3; continue; }
        if (d >= 48 && d <= 57) { const s = i; i++; while (i < n) { const e = src.charCodeAt(i); if (e < 128 && ID[e] || ((e === 43 || e === 45) && (src.charCodeAt(i - 1) | 32) === 101)) i++; else break; } push(NUM, s, i); continue; }
        push(PUN, i, i + 1); i++; continue;
      }
      case 63: { const d = src.charCodeAt(i + 1), e = src.charCodeAt(i + 2); if (d === 46 && !(e >= 48 && e <= 57)) { push(PUN, i, i + 2); i += 2; } else { push(PUN, i, i + 1); i++; } continue; }
      case 60: if (src.startsWith('!--', i + 1)) return bail(stats, 'htmlcomment', i); push(PUN, i, i + 1); i++; continue;
      case 43: case 45: if (c === 45 && src.startsWith('->', i + 1)) { let q = i - 1; while (q >= 0 && (src.charCodeAt(q) === 32 || src.charCodeAt(q) === 9)) q--; if (q < 0 || src.charCodeAt(q) === 10 || src.charCodeAt(q) === 13) return bail(stats, 'htmlcomment', i); }
        if (src.charCodeAt(i + 1) === c) { push(PUN, i, i + 2); i += 2; } else { push(PUN, i, i + 1); i++; } continue;
      case 92: { const s = i; i += 2; for (;;) { const d = src.charCodeAt(i); if (i < n && (d < 128 ? ID[d] : !isWs(d))) i++; else if (d === 92) i += 2; else break; } if (decodeId(src.slice(s, i)) === 'location') return bail(stats, 'idescape', s); push(IDT, s, i); continue; }
      default: push(PUN, i, i + 1); i++; continue;
    }
  }
  if (stk.length) return bail(stats, 'unbalanced', n);
  if (nt && K[nt - 1] === PUN) { const c = ch(nt - 1); if (!(c === 41 || c === 93 || c === 125 || c === 59 || (E[nt - 1] - S[nt - 1] === 2 && (src.charCodeAt(S[nt - 1]) === 43 || src.charCodeAt(S[nt - 1]) === 45)))) return bail(stats, 'tokerr', n); }   // a dangling operator at EOF does not parse

  // 1 = the token ends an expression (a following `[` or `(` is a member or call), 0 = it starts one (array literal, parenthesised
  // expression), -1 unsure.
  const endsExpr = b => {
    if (b < 0) return 0;
    const k = K[b];
    if (k === IDT) { if (isDot(b - 1) || isQDot(b - 1)) return 1; const w = word(b); if (w === 'this' || !KW.has(w)) return 1; return EXPR_KW.has(w) ? 0 : -1; }
    if (k !== PUN) return 1;   // string, number, regex, template
    if (E[b] - S[b] !== 1) return -1;   // ++ -- ?. ...
    const c = src.charCodeAt(S[b]);
    if (c === 93) return 1;
    if (c === 125) return -1;
    if (c === 41) { const o = mt(b); return o < 0 ? -1 : stmtParen(o) ? 0 : 1; }
    return 0;
  };
  const stmtParen = o => {   // `(` of an if/while/for/with header: what follows is a new statement
    const w = o > 0 && K[o - 1] === IDT ? word(o - 1) : '';
    return w === 'if' || w === 'while' || w === 'for' || w === 'with' || (w === 'await' && o > 1 && word(o - 2) === 'for');
  };
  const edits = [], imps = [];
  let declared = false, unsure = '', upos = 0;   // declared: a binding of `location` (the AST drops all its location edits then)
  const unsureAt = (why, t) => { if (!unsure) { unsure = why; upos = S[t]; } };
  for (let ci = 0; ci < cand.length; ci++) {
    const t = cand[ci];
    if (E[t] - S[t] === 6) {   // import(
      if (!(ch(t + 1) === 40) || isDot(t - 1) || isQDot(t - 1)) continue;
      const close = mt(t + 1);
      if (close < 0) return bail(stats, 'importargs', S[t]);
      if (ch(close + 1) === 123) { if (nl(E[close], S[close + 1])) return bail(stats, 'importmethod', S[t]); continue; }   // `import(x) {` on one line is a method named import
      const first = t + 2;
      if (ch(first) === 40) return bail(stats, 'importparen', S[t]);
      let d = 0, j = first, last = -1;
      for (; j < nt; j++) {
        if (K[j] === PUN) { const c = src.charCodeAt(S[j]); if (c === 40 || c === 91 || c === 123) d++; else if (c === 41 || c === 93 || c === 125) { if (d === 0) break; d--; } else if (c === 44 && d === 0 && E[j] - S[j] === 1) break; }
        last = j;
      }
      if (j >= nt || last < first) return bail(stats, 'importargs', S[t]);
      imps.push({ start: S[t], end: S[first], text: '__lbImport(' });
      imps.push({ start: E[last], end: E[last], text: ',"__LB_IMU__"' });
      continue;
    }
    // `location` token
    const prev = t - 1;
    if (isDot(prev) || isQDot(prev)) {   // member .location / ?.location
      const r = chain(prev); if (!r) { unsureAt('chain', t); continue; }
      emitMember(r, S[t], E[t], false);
      continue;
    }
    const nx = t + 1;
    if (ch(nx) === 58 && (ch(prev) === 123 || ch(prev) === 44)) continue;   // {location: x} key (the AST skips it too)
    if (isDot(nx) || isQDot(nx) || ch(nx) === 91) {
      edits.push({ start: S[t], end: E[t], text: '__lbLoc' });   // bare read of the global; computed ["location"] is handled by its own `[` scan below
      continue;
    }
    const kind = classify(t, prev, nx);
    if (kind === 1) edits.push({ start: S[t], end: E[t], text: '__lbLoc' });
    else if (kind === 2) declared = true;
    else if (kind === 0) unsureAt('bare:' + (prev >= 0 ? src.slice(S[prev], Math.min(E[prev], S[prev] + 8)) : '^') + ' _ ' + (nx < nt ? src.slice(S[nx], Math.min(E[nx], S[nx] + 4)) : '$'), t);
  }
  if (declared) edits.length = 0;
  else if (unsure) return bail(stats, unsure, upos);
  // computed obj["location"] / obj?.["location"]: scan strings between [ and ]
  if (!declared && (src.indexOf('"location"') !== -1 || src.indexOf("'location'") !== -1 || /\[\s*['"][^'"]{0,40}\\/.test(src))) {
    for (let t = 1; t + 1 < nt; t++) {
      if (K[t] !== STR || ch(t - 1) !== 91 || ch(t + 1) !== 93) continue;
      const raw = src.slice(S[t], E[t]);
      if (raw.indexOf('\\') !== -1) { if (raw.length > 60) continue; const v = decodeStr(raw); if (v === null) return bail(stats, 'strescape', S[t]); if (v !== 'location') continue; }
      else if (raw !== '"location"' && raw !== "'location'") continue;
      const b = t - 1, before = b - 1;
      let dotTok = b;   // for `?.[` the optional token precedes [
      if (isQDot(before)) dotTok = before;
      else { const e = endsExpr(before); if (e < 0) return bail(stats, 'arraylit', S[t]); if (e === 0) continue; }   // 0: array literal or computed key, not a member access
      const r = chain(dotTok); if (!r) return bail(stats, 'chain', S[t]);
      emitMember(r, S[t], E[t], true);
    }
  }
  for (const e of imps) edits.push(e);
  if (!edits.length) return src;
  edits.sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start));
  const parts = []; let pos = 0;
  for (let q = edits.length - 1; q >= 0; q--) { const e = edits[q]; parts.push(src.slice(pos, e.start), e.text); pos = e.end; }
  parts.push(src.slice(pos));
  return parts.join('');

  // `)` closing a (a, location) group: 1 = parameter list, 0 = not, -1 unsure
  function shapeOfClose(c) {
    const o = mt(c), a = c + 1;
    if (ch(a) === 61 && ch(a + 1) === 62) return nl(E[c], S[a]) ? -1 : 1;   // =>
    if (ch(a) === 123) {
      if (nl(E[c], S[a])) return -1;
      if (o > 0 && K[o - 1] === IDT) { const w = word(o - 1); return /^(if|while|for|switch|with)$/.test(w) ? 0 : 1; }   // function f(a, location) { / method / catch
      return -1;
    }
    return 0;
  }
  // `, location` inside a declaration list: walks back on the same bracket level to var/let/const. 1 = list item, 0 = not, -1 unsure.
  function listKw(comma) {
    for (let j = comma; j >= 0; j--) {
      if (K[j] === PUN && E[j] - S[j] === 1) {
        const c = src.charCodeAt(S[j]);
        if (c === 41 || c === 93 || c === 125) { const o = mt(j); if (o < 0) return -1; j = o; }
        else if (c === 59 || c === 40 || c === 91 || c === 123) return 0;
      } else if (K[j] === IDT) { const w = word(j); if ((w === 'var' || w === 'let' || w === 'const') && !isDot(j - 1)) return 1; }
      if (j > 0 && ch(j - 1) !== 44 && nl(E[j - 1], S[j])) return -1;   // a line break not after a comma could be ASI: unsure
    }
    return 0;
  }
  // what the object `{` at o is: 1 expression (object literal or assignment pattern), 2 declaration pattern, 0 unsure
  function objCtx(o, spread) {   // spread: the caller is `...location`, which is not skipped in an assignment pattern, so `} =` is unsure
    for (let g = 0; g < 8; g++) {
      const pp = o - 1, c = ch(pp);
      if (spread) { const z = mt(o); if (z < 0 || ch(z + 1) === 61) return 0; }
      if (pp < 0) return 0;
      if (K[pp] === IDT) { const w = word(pp); if (isDot(pp - 1)) return 0; if (w === 'var' || w === 'let' || w === 'const') return 2; return EXPR_KW.has(w) ? 1 : 0; }
      if (c === 61 || c === 63 || c === 38 || c === 124 || c === 43 || c === 45 || c === 42 || c === 37 || c === 33 || c === 126 || c === 60) return 1;
      if (c === 40 || c === 44) {
        const q = P[o]; if (q < 0 || ch(q) !== 40) return 0;
        const sh = shapeOfClose(mt(q)); return sh === 1 ? 2 : sh === 0 ? 1 : 0;
      }
      if (c === 58) { const q = P[o]; if (q < 0 || ch(q) !== 123) return 0; o = q; continue; }
      return 0;
    }
    return 0;
  }
  // a bare `location` that is not a member and not followed by . ?. [ : 1 reference (edit), 2 binding (declared), 3 skip (accessor key), 0 unsure
  function classify(t, prev, nx) {
    const p = ch(prev), q = ch(nx), pk = prev >= 0 ? K[prev] : 0;
    const arrow = q === 61 && ch(nx + 1) === 62;
    if ((p === 123 || p === 44) && (q === 125 || q === 44) && ch(P[t]) === 123) {   // {location} shorthand: no edit in an object literal, a binding in a declaration pattern
      const r = objCtx(P[t]);
      if (r === 1) return 3;
      if (r === 2) return 2;
      return 0;
    }
    if (pk === IDT) {
      const w = word(prev);
      if ((w === 'var' || w === 'let' || w === 'const' || w === 'function' || w === 'class') && !isDot(prev - 1)) return 2;
      if (q === 40 && (w === 'get' || w === 'set' || w === 'static' || w === 'async') && !isDot(prev - 1) && !nl(E[prev], S[t])) return 3;
      if (OPKW.has(w) && !isDot(prev - 1) && !isQDot(prev - 1)) return arrow ? 0 : 1;
      return 0;
    }
    if (p === 44) { const l = listKw(prev); if (l === 1) return 2; if (l < 0) return 0; }
    if (p === 40 || p === 44) {
      const o = P[t];
      if (o < 0 || ch(o) !== 40) return 0;
      if (q === 41 || q === 44) { const sh = shapeOfClose(mt(o)); return sh === 1 ? 2 : sh === 0 ? 1 : 0; }
      if (p === 40 && BINQ.has(q) && !arrow) return 1;
      return 0;
    }
    if (pk === PUN) {
      if (E[prev] - S[prev] === 3 && (q === 41 || q === 44)) {   // `...location` as a call argument (spread) or a rest parameter
        const o = P[t];
        if (o >= 0 && ch(o) === 123 && q === 44) return objCtx(o, true) === 1 ? 1 : 0;   // {...location, a}
        if (o < 0 || ch(o) !== 40) return 0;
        const sh = shapeOfClose(mt(o)); return sh === 1 ? 2 : sh === 0 ? 1 : 0;
      }
      if (E[prev] - S[prev] === 2) { const c = src.charCodeAt(S[prev]); return (c === 43 || c === 45) ? 1 : 0; }   // prefix ++ --
      if (OPERAND.has(p)) return (arrow || (p === 42 && q === 40)) ? 0 : 1;
    }
    return 0;
  }
  // Walk back from the `.`/`?.` (or the `[`/`?.` of a computed access) over the receiver chain.
  // Returns { start: source index of the receiver, objEnd: end of receiver, sc: optional link below, seq }, or null when unsure.
  function chain(dotTok) {
    let j = dotTok - 1, sc = false, calls = 0, links = 0;
    const objEnd = E[dotTok - 1];
    for (;;) {
      if (j < 0) return null;
      const c = ch(j), k = K[j];
      if (k === IDT) {
        if (isDot(j - 1)) { j -= 2; links++; continue; }   // property name: any word
        if (isQDot(j - 1)) { sc = true; j -= 2; links++; continue; }
        const w = word(j);
        if (KW.has(w) && w !== 'this') return null;
        if (j >= 1 && K[j - 1] === IDT && word(j - 1) === 'new') {
          if (calls > 1) return null;
          if (j >= 2 && K[j - 2] === IDT && word(j - 2) === 'new') return null;
          return { start: calls === 1 ? S[j - 1] : S[j], objEnd, sc };
        }
        // `this` or an ordinary identifier preceded by something that is not a member dot
        return { start: S[j], objEnd, sc };
      }
      if (k === STR) return { start: S[j], objEnd, sc };
      if (c === 41) {   // ) : call, or a parenthesised receiver
        const m = mt(j); if (m < 0) return null;
        const b = m - 1;
        if (isQDot(b)) { sc = true; j = b - 1; calls++; links++; continue; }
        const e = endsExpr(b);
        if (e < 0) return null;
        if (e === 1) { calls++; links++; j = b; continue; }
        if (links) return { start: S[m], objEnd, sc };
        // (X).location: the AST receiver is X itself (parens are not nodes); a top level comma makes it a SequenceExpression
        let f = m + 1, l = j - 1;
        while (f < l && ch(f) === 40 && mt(f) === l) { f++; l--; }
        if (f > l) return null;
        let seq = false;
        for (let q = f; q <= l; q++) { if (ch(q) === 44) { seq = true; break; } if (K[q] === PUN && E[q] - S[q] === 1) { const cc = src.charCodeAt(S[q]); if (cc === 40 || cc === 91 || cc === 123) { const z = mt(q); if (z < 0) return null; q = z; } } }
        return { start: S[f], objEnd: E[l], sc: false, seq };
      }
      if (c === 93) {   // ] : computed member, or an array literal receiver
        const m = mt(j); if (m < 0) return null;
        const b = m - 1;
        if (isQDot(b)) { sc = true; j = b - 1; links++; continue; }
        const e = endsExpr(b);
        if (e < 0) return null;
        if (e === 1) { links++; j = b; continue; }
        return { start: S[m], objEnd, sc };
      }
      return null;   // template, regex, number, } ... : unsure
    }
  }
  function emitMember(r, ps, pe, br) {
    edits.push({ start: r.start, end: r.start, text: r.seq ? '__lbSafe((' : '__lbSafe(' });
    if (r.sc) edits.push({ start: r.objEnd, end: pe, text: (r.seq ? '))' : ')') + (br ? '?.["__lbLoc$"' : '?.__lbLoc$') });
    else {
      edits.push({ start: r.objEnd, end: r.objEnd, text: r.seq ? '))' : ')' });
      edits.push({ start: ps, end: pe, text: br ? '"__lbLoc$"' : '__lbLoc$' });
    }
  }
}
if (typeof module !== 'undefined' && module.exports) module.exports = { tokRewrite, VERSION };
else { root.LB_tokRewrite = tokRewrite; root.LB_TOKRW_VERSION = VERSION; }
})(typeof self !== 'undefined' ? self : this);
