# CL-15 prototype: token-level rewriter (measure-first result)

Branch `proto/cl15` (off `speed/1.3-quick`). Not wired into the app, no release. Files: `tools/cl15/tokrw.js` (scanner, returns the rewritten
string or `null` = "unsure, use the AST path"), `tools/cl15/bench.cjs` (parity and timing, cuts `rewriteLocationRefs` verbatim out of
`app/main.js`, acorn and meriyah baselines), `tools/cl15/fuzz.cjs`. Run: `node tools/cl15/bench.cjs --reps 5 --fuzz 6000`.
(The TS-10 `rwbench` is not in the repo, so the bench is standalone.)

## Design
One pass tokenizer (strings, nested template literals, comments, regex vs division by previous token, hashbang, `#private`, identifier
escapes). Edits are the same as the AST path. Receiver start for `X.location` comes from walking the token chain backwards (idents, calls,
index groups, `?.`, `new`); anything else (parenthesised receiver, array literal, string, template, `}`, `super`, `import.meta`) returns `null`.
Bare `location` is only edited when the next token is `.`, `?.` or `[` (a binding can never be followed by those). A keyword-introduced
binding (`var|let|const|function|class location`), a parameter list or a `var a, location =` list marks the file declared (the AST path then
drops all its `location` edits, so the scanner does too); any other bare `location` returns `null`. `import(` edits only with `imp`.
Not done: `with` bail (AST path does not bail on it either, so output equals), `rwVer` hook, `features.tokRewrite`.

## Parity
- Corpus (this VM has no saved N2/N3 site bundles; `~/.cache/limitless-fixtures/bundles/` does not exist): 74 distinct JS files of 16 KB or more,
  real minified browser bundles (monaco, elk, pdf.js worker, axe-core, react-dom dev builds, html/css workers) plus this repo's own scripts.
  Each file with `imp` off and on: 148 comparisons, **148 byte-identical, 0 different, 0 bailouts**. Only 42 comparisons contain edits, the rest
  are files where both paths return the source untouched or declared-`location` files.
- Fuzz (generator of small programs with `location` in about 60 roles, wrapped in a class method; 6000 programs x 2): 0 different. About
  58 percent bail by design (parenthesised receivers, bare `location =`, shorthand and the like), those are the AST path's cases.
- Known gaps to close before a build: (1) a script that fails to parse is returned untouched by the AST path but would be rewritten by the
  scanner (no syntax check); (2) the `declared` shape rules (`, location =` after a `var` found by a backward scan without a statement
  boundary on ASI-only code) are heuristics; (3) real site bundles are missing from the corpus, which is where bare `location` reads and
  odd regex/division spots show up; (4) `[` after `)` is assumed to be an index, not an array literal at statement start.

## Speed (node 22, 1x CPU, median of 3, machine at load 14 so absolutes are inflated, ratios hold)
| bundle | KB | acorn ms | meriyah ms | scanner ms | vs acorn | vs meriyah |
|---|---|---|---|---|---|---|
| monaco-setup | 6203 | 2726 | 2743 | 140 | 19.5x | 19.6x |
| elk-worker | 4671 | 1251 | 1090 | 86 | 14.6x | 12.7x |
| boot | 2177 | 1058 | 1117 | 55 | 19.2x | 20.3x |
| css.worker | 1786 | 469 | 554 | 44 | 10.6x | 12.6x |
| elk.bundled | 1569 | 1253 | 924 | 52 | 23.9x | 17.7x |

Median over the 5 biggest: **19.2x vs acorn, 17.7x vs meriyah**; whole corpus 13579 ms (acorn) against 859 ms (scanner) = 15.8x. Slowest ratio
5.3x (axe-core). 4x CPU in the page and the Worker round trip were not measured (node only); the ratio should carry since both are CPU bound.

## Verdict against the spec's exit criteria
Median over the 5 big bundles at least 3x faster: met (about 18x). Zero parity failures: met on this corpus (not the 38 golden bundles).
Build only after the golden corpus run and the gaps above; the saving is the parse share of the 3 to 4.6 s first visit at 4x CPU.
