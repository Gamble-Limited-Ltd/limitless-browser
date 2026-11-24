'use strict';
// CL-15 prototype: token-level rewriter, same output as rewriteLocationRefs (app/main.js) or null (= "unsure, use the AST path").
// Standalone; not wired into the app. tokRewrite(src, imp, stats) returns a string, or null when it bails out.
// Soundness rule: a bare `location` token is only edited when the next token is `.`, `?.` or `[` (a binding can never be followed by
// those), so "is `location` declared anywhere" needs no scope analysis: any other bare `location` (param, var, shorthand, `location =`) bails.
const VERSION = 1;
const KW = new Set(('break case catch class const continue debugger default delete do else enum export extends false finally for function if ' +
  'import in instanceof let new null return super switch throw true try typeof var void while with yield await static of async get set').split(' '));
// keywords after which `/` starts a regex literal
const RE_AFTER = new Set('return typeof instanceof in of new delete void throw case do else yield await'.split(' '));
const IDT = 1, PUN = 2, STR = 3, TPL = 4, REG = 5, NUM = 6;
const ID = new Uint8Array(128);
for (let c = 48; c < 58; c++) ID[c] = 2;
for (let c = 65; c < 91; c++) ID[c] = 1;
for (let c = 97; c < 123; c++) ID[c] = 1;
ID[36] = 1; ID[95] = 1;
const isWs = c => c === 32 || c === 9 || c === 10 || c === 13 || c === 11 || c === 12 || c === 0xa0 || c === 0xfeff || c === 0x2028 || c === 0x2029 || (c >= 0x2000 && c <= 0x200a) || c === 0x3000 || c === 0x1680 || c === 0x202f || c === 0x205f;

const decodeId = t => t.replace(/\\u\{([0-9a-fA-F]+)\}|\\u([0-9a-fA-F]{4})/g, (_, a, b) => String.fromCodePoint(parseInt(a || b, 16)));
function bail(stats, why) { if (stats) { stats.tokFallback = (stats.tokFallback || 0) + 1; (stats.why = stats.why || {})[why] = (stats.why[why] || 0) + 1; } return null; }

function tokRewrite(src, imp, stats) {
  if (!src || (src.indexOf('location') === -1 && !(imp && /\bimport\s*\(/.test(src)))) return src;
  const n = src.length;
  let K = new Uint8Array(1 << 12), S = new Int32Array(1 << 12), E = new Int32Array(1 << 12), nt = 0;
  const cand = [];   // token indexes of `location` and `import`
  function push(k, s, e) {
    if (nt === K.length) {
      const K2 = new Uint8Array(nt * 2); K2.set(K); K = K2;
      const S2 = new Int32Array(nt * 2); S2.set(S); S = S2;
      const E2 = new Int32Array(nt * 2); E2.set(E); E = E2;
    }
    K[nt] = k; S[nt] = s; E[nt] = e; return nt++;
  }
  let i = 0, depth = 0; const tpl = [];
  if (src.charCodeAt(0) === 35 && src.charCodeAt(1) === 33) { while (i < n && src.charCodeAt(i) !== 10) i++; }
  // regexAllowed: decided by the previous significant token
  function regexOk() {
    if (!nt) return true;
    const k = K[nt - 1];
    if (k === PUN) { const c = src.charCodeAt(S[nt - 1]); const len = E[nt - 1] - S[nt - 1]; return !(c === 41 || c === 93 || (len === 2 && (c === 43 || c === 45))); }   // ) ] ++ -- then division; } counts as regex (statement start)
    if (k === IDT) return RE_AFTER.has(src.slice(S[nt - 1], E[nt - 1]));
    return false;
  }
  function tplChunk() {   // i is after the opening ` or the closing } of a substitution; emits a TPL token; returns false on error
    const s = i;
    while (i < n) {
      const c = src.charCodeAt(i);
      if (c === 92) i += 2;
      else if (c === 96) { i++; push(TPL, s - 1 < 0 ? 0 : s - 1, i); return true; }
      else if (c === 36 && src.charCodeAt(i + 1) === 123) { push(TPL, s - 1, i); push(PUN, i + 1, i + 2); i += 2; tpl.push(depth); depth = 0; return true; }
      else i++;
    }
    return false;
  }
  while (i < n) {
    const c = src.charCodeAt(i);
    if (c < 128 && ID[c] === 1 || c > 127 && !isWs(c) || c === 35) {   // identifier (or #private)
      const s = i; i++; let esc = false;
      for (;;) { const d = src.charCodeAt(i); if (d < 128 ? ID[d] : !isWs(d)) i++; else if (d === 92) { esc = true; i += 2; } else break; }
      if (esc) { if (decodeId(src.slice(s, i)) === 'location') return bail(stats, 'idescape'); push(IDT, s, i); continue; }   // an escaped name that is not `location` is an ordinary identifier
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
        for (;;) { if (i >= n) return bail(stats, 'tokerr'); const d = src.charCodeAt(i); if (d === 92) i += 2; else if (d === c) { i++; break; } else if (d === 10 || d === 13) return bail(stats, 'tokerr'); else i++; }
        push(STR, s, i); continue;
      }
      case 96: i++; if (!tplChunk()) return bail(stats, 'tokerr'); continue;
      case 47: {
        const d = src.charCodeAt(i + 1);
        if (d === 47) { i += 2; while (i < n) { const e = src.charCodeAt(i); if (e === 10 || e === 13 || e === 0x2028 || e === 0x2029) break; i++; } continue; }
        if (d === 42) { const e = src.indexOf('*/', i + 2); if (e < 0) return bail(stats, 'tokerr'); i = e + 2; continue; }
        if (regexOk()) {
          const s = i; i++; let cls = false;
          for (;;) {
            if (i >= n) return bail(stats, 'tokerr');
            const e = src.charCodeAt(i);
            if (e === 10 || e === 13) return bail(stats, 'tokerr');
            if (e === 92) i += 2; else if (e === 91) { cls = true; i++; } else if (e === 93) { cls = false; i++; } else if (e === 47 && !cls) { i++; break; } else i++;
          }
          while (i < n) { const e = src.charCodeAt(i); if (e < 128 && ID[e] === 1) i++; else break; }
          push(REG, s, i); continue;
        }
        push(PUN, i, i + 1); i++; continue;
      }
      case 123: depth++; push(PUN, i, i + 1); i++; continue;
      case 125:
        if (depth === 0 && tpl.length) { push(PUN, i, i + 1); depth = tpl.pop(); i++; if (!tplChunk()) return bail(stats, 'tokerr'); continue; }
        depth--; push(PUN, i, i + 1); i++; continue;
      case 46: {
        const d = src.charCodeAt(i + 1);
        if (d === 46 && src.charCodeAt(i + 2) === 46) { push(PUN, i, i + 3); i += 3; continue; }
        if (d >= 48 && d <= 57) { const s = i; i++; while (i < n) { const e = src.charCodeAt(i); if (e < 128 && ID[e] || ((e === 43 || e === 45) && (src.charCodeAt(i - 1) | 32) === 101)) i++; else break; } push(NUM, s, i); continue; }
        push(PUN, i, i + 1); i++; continue;
      }
      case 63: { const d = src.charCodeAt(i + 1), e = src.charCodeAt(i + 2); if (d === 46 && !(e >= 48 && e <= 57)) { push(PUN, i, i + 2); i += 2; } else { push(PUN, i, i + 1); i++; } continue; }
      case 60: if (src.startsWith('!--', i + 1)) return bail(stats, 'htmlcomment'); push(PUN, i, i + 1); i++; continue;
      case 43: case 45: if (c === 45 && src.startsWith('->', i + 1)) { let q = i - 1; while (q >= 0 && (src.charCodeAt(q) === 32 || src.charCodeAt(q) === 9)) q--; if (q < 0 || src.charCodeAt(q) === 10 || src.charCodeAt(q) === 13) return bail(stats, 'htmlcomment'); }
        if (src.charCodeAt(i + 1) === c) { push(PUN, i, i + 2); i += 2; } else { push(PUN, i, i + 1); i++; } continue;
      case 92: { const s = i; let esc = true; i += 2; for (;;) { const d = src.charCodeAt(i); if (d < 128 ? ID[d] : !isWs(d)) i++; else if (d === 92) i += 2; else break; } if (decodeId(src.slice(s, i)) === 'location') return bail(stats, 'idescape'); push(IDT, s, i); continue; }
      default: push(PUN, i, i + 1); i++; continue;
    }
  }
  if (depth !== 0 || tpl.length) return bail(stats, 'tokerr');

  const ch = t => (t >= 0 && t < nt && K[t] === PUN && E[t] - S[t] === 1) ? src.charCodeAt(S[t]) : 0;   // single-char punct code
  const isQDot = t => t >= 0 && K[t] === PUN && E[t] - S[t] === 2 && src.charCodeAt(S[t]) === 63;
  const isDot = t => ch(t) === 46;
  const word = t => K[t] === IDT ? src.slice(S[t], E[t]) : '';
  // ident that can end an expression (receiver of . ( [)
  const exprEnd = t => t >= 0 && ((K[t] === IDT && (!KW.has(word(t)) || word(t) === 'this')) );
  const matchBack = (t) => {   // t is ) or ]; returns index of its opener, -1 if unbalanced
    let d = 0;
    for (let j = t; j >= 0; j--) {
      if (K[j] !== PUN) continue;
      const c = src.charCodeAt(S[j]), len = E[j] - S[j];
      if (c === 41 || c === 93 || c === 125) d++;
      else if (c === 40 || c === 91 || c === 123) { d--; if (d === 0) return j; }   // ${ (len 2) opens like {
      void len;
    }
    return -1;
  };
  const edits = [], imps = [];
  let declared = false, unsure = '';   // declared: a keyword-introduced binding of `location` (the AST drops all its location edits then)
  // a ${ in a template closes with a } punct: both count as brace pairs in matchBack, so templates inside chains balance.
  for (let ci = 0; ci < cand.length; ci++) {
    const t = cand[ci];
    if (E[t] - S[t] === 6) {   // import(
      if (!(ch(t + 1) === 40) || isDot(t - 1) || isQDot(t - 1)) continue;
      let d = 0, j = t + 2;
      if (ch(j) === 40) return bail(stats, 'importparen');
      const first = j; let last = -1;
      for (; j < nt; j++) {
        if (K[j] === PUN) { const c = src.charCodeAt(S[j]); if (c === 40 || c === 91 || c === 123) d++; else if (c === 41 || c === 93 || c === 125) { if (d === 0) break; d--; } else if (c === 44 && d === 0 && E[j] - S[j] === 1) break; }
        last = j;
      }
      if (j >= nt || last < first) return bail(stats, 'importargs');
      imps.push({ start: S[t], end: S[first], text: '__lbImport(' });
      imps.push({ start: E[last], end: E[last], text: ',"__LB_IMU__"' });
      continue;
    }
    // `location` token
    const prev = t - 1;
    if (isDot(prev) || isQDot(prev)) {   // member .location / ?.location
      const r = chain(prev); if (!r) { unsure = unsure || 'chain'; continue; }
      emitMember(r, S[t], E[t], false, prev);
      continue;
    }
    const nx = t + 1;
    if (ch(nx) === 58 && (ch(prev) === 123 || ch(prev) === 44)) continue;   // {location: x} key (the AST skips it too)
    if (isDot(nx) || isQDot(nx) || ch(nx) === 91) {
      edits.push({ start: S[t], end: E[t], text: '__lbLoc' });   // bare read of the global; computed ["location"] is handled by its own `[` scan below
      continue;
    }
    if (prev >= 0 && K[prev] === IDT && /^(var|let|const|function|class)$/.test(word(prev))) { declared = true; continue; }
    if (declaredByShape(t, prev, nx)) { declared = true; continue; }
    if (!unsure) unsure = 'bare:' + (prev >= 0 ? src.slice(S[prev], Math.min(E[prev], S[prev] + 8)) : '^') + ' _ ' + (nx < nt ? src.slice(S[nx], Math.min(E[nx], S[nx] + 4)) : '$');
  }
  if (declared) edits.length = 0;
  else if (unsure) return bail(stats, unsure);
  // computed obj["location"] / obj?.["location"]: scan strings between [ and ]
  if (!declared && (src.indexOf('"location"') !== -1 || src.indexOf("'location'") !== -1 || /\[\s*['"][^'"]{0,40}\\/.test(src))) {
    for (let t = 1; t + 1 < nt; t++) {
      if (K[t] !== STR || ch(t - 1) !== 91 || ch(t + 1) !== 93) continue;
      const raw = src.slice(S[t], E[t]);
      if (raw.indexOf('\\') !== -1) { if (raw.length < 40) return bail(stats, 'strescape'); continue; }
      if (raw !== '"location"' && raw !== "'location'") continue;
      const b = t - 1, before = b - 1;
      let dotTok = b;   // for `?.[` the optional token precedes [
      if (isQDot(before)) dotTok = before;
      else if (!(exprEnd(before) || ch(before) === 41 || ch(before) === 93)) return bail(stats, 'arraylit');
      const r = chain(dotTok); if (!r) return bail(stats, 'chain');
      emitMember(r, S[t], E[t], true, dotTok);
    }
  }
  for (const e of imps) edits.push(e);
  if (!edits.length) return src;
  edits.sort((a, b) => b.start - a.start || (b.end - b.start) - (a.end - a.start));
  const parts = []; let pos = 0;
  for (let q = edits.length - 1; q >= 0; q--) { const e = edits[q]; parts.push(src.slice(pos, e.start), e.text); pos = e.end; }
  parts.push(src.slice(pos));
  return parts.join('');

  // `location` as a parameter ((a, location) => or function f(a, location) {) or in a var/let/const list (var a = 1, location = 2).
  function declaredByShape(t, prev, nx) {
    const p = ch(prev), q = ch(nx);
    if ((p === 40 || p === 44) && (q === 44 || q === 41)) {   // ( or , before; , or ) after
      let d = 0, j = nt;
      for (j = nx; j < nt; j++) { if (K[j] !== PUN) continue; const c = src.charCodeAt(S[j]); if (c === 40 || c === 91 || c === 123) d++; else if (c === 41 || c === 93 || c === 125) { if (d === 0) break; d--; } }
      if (j >= nt || ch(j) !== 41) return false;
      const o = matchBack(j); if (o < 0) return false;
      if (ch(j + 1) === 61 && ch(j + 2) === 62) return true;   // =>
      if (ch(j + 1) === 123 && o > 0 && K[o - 1] === IDT) return !/^(if|while|for|switch|with|catch)$/.test(word(o - 1)) || word(o - 1) === 'catch';
      return false;
    }
    if (p === 44 && q === 61) {   // list item: walk back at depth 0 to var/let/const, stop at ; { }
      for (let j = prev - 1; j >= 0; j--) {
        if (K[j] === PUN) { const c = src.charCodeAt(S[j]); if (c === 41 || c === 93) { j = matchBack(j); if (j < 0) return false; continue; } if (c === 59 || c === 123 || c === 125 || c === 40 || c === 91) return false; }
        else if (K[j] === IDT) { const w = word(j); if (w === 'var' || w === 'let' || w === 'const') return !isDot(j - 1); }
      }
    }
    return false;
  }

  // Walk back from the `.`/`?.` (or the `[`/`?.` of a computed access) over the receiver chain.
  // Returns { start: source index of the receiver, objEnd: end of receiver, sc: optional link below }, or null when unsure.
  function chain(dotTok) {
    let j = dotTok - 1, sc = false, calls = 0;
    for (;;) {
      if (j < 0) return null;
      const c = ch(j);
      if (K[j] === IDT) {
        if (isDot(j - 1)) { j -= 2; continue; }   // property name: any word
        if (isQDot(j - 1)) { sc = true; j -= 2; continue; }
        const w = word(j);
        if (KW.has(w) && w !== 'this') return null;
        if (j >= 1 && K[j - 1] === IDT && word(j - 1) === 'new') {
          if (calls > 1) return null;
          if (j >= 2 && K[j - 2] === IDT && word(j - 2) === 'new') return null;
          return { start: calls === 1 ? S[j - 1] : S[j], objEnd: E[dotTok - 1], sc };
        }
        // `this` or an ordinary identifier preceded by something that is not a member dot
        return { start: S[j], objEnd: E[dotTok - 1], sc };
      }
      if (c === 41) {   // ) : call
        const m = matchBack(j); if (m < 0) return null;
        const b = m - 1;
        if (isQDot(b)) { sc = true; j = b - 1; calls++; continue; }
        if (!(exprEnd(b) || ch(b) === 41 || ch(b) === 93)) return null;   // parenthesised expression or keyword( : unsure
        calls++; j = b; continue;
      }
      if (c === 93) {   // ] : computed member
        const m = matchBack(j); if (m < 0) return null;
        const b = m - 1;
        if (isQDot(b)) { sc = true; j = b - 1; continue; }
        if (!(exprEnd(b) || ch(b) === 41 || ch(b) === 93)) return null;   // array literal
        j = b; continue;
      }
      return null;   // string, template, regex, number, } ... : unsure
    }
  }
  function emitMember(r, ps, pe, br, dotTok) {
    const seq = false;   // SequenceExpression receivers are always parenthesised: chain() returns null for them
    edits.push({ start: r.start, end: r.start, text: seq ? '__lbSafe((' : '__lbSafe(' });
    if (r.sc) edits.push({ start: r.objEnd, end: pe, text: ')' + (br ? '?.["__lbLoc$"' : '?.__lbLoc$') });
    else {
      edits.push({ start: r.objEnd, end: r.objEnd, text: ')' });
      edits.push({ start: ps, end: pe, text: br ? '"__lbLoc$"' : '__lbLoc$' });
    }
  }
}
module.exports = { tokRewrite, VERSION };
