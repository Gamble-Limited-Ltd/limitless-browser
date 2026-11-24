# CL-15 prototype: token-level rewriter (measure-first result)

Branch `proto/cl15` (off `speed/1.3-quick`). Not wired into the app, no release. Files: `app/tokrw.js` (scanner, returns the rewritten
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

## Parity (scanner VERSION 2)
- **Golden corpus:** `~/.cache/limitless-fixtures/bundles/` (rebuild: `node tools/cl15/fetch-corpus.mjs`, public front pages only, plain fetch, no
  cookies, manifest.json with url, size, sha256, date). 111 files of 16 KB or more from 24 sites (steam, discord app and site, kahoot, create.kahoot,
  gimkit, coolmath, desmos, bbc, github, twitch, tumblr, duckduckgo, bing, medium, cnn, weather, spotify, notion, walmart, pinterest, netflix, roblox,
  mdn, plus others). Blocked or script-less front pages (quizlet, nytimes, stackoverflow, canva, ebay, etsy, linkedin, npmjs: 403; reddit,
  classroom, khan, wikipedia, amazon, imdb, espn, docs: no external script of 16 KB) were skipped. Run: `node tools/cl15/bench.cjs --reps 3 --fuzz 6000
  [--max-mb 20] ~/.cache/limitless-fixtures/bundles` (default cap 9 MB per file; the 12.5 MB discord bundle needs `--max-mb 20`).
- **Result (imp off and on, 220 comparisons):** 0 different from the acorn path, 0 different from the meriyah path, 154 comparisons with edits.
  Fuzz 12000 comparisons (against acorn and meriyah): 0 different, about 30 percent bail by design. The 74-file repo corpus of the first prototype
  is no longer needed for the gate (use `bench.cjs` with no path for it).
- **Bail reasons:** golden corpus: none under 9 MB (0 of 220). Before the fixes 36 of 220 bailed (bare `typeof location`, `{hash} = location`, `get
  location()`, `(a || b).location`, `["location"]` in an array, `(0, f)().location`). Reasons still produced by the scanner: `tokerr`
  (unterminated string, template, regex or comment, dangling operator at EOF), `unbalanced` (bracket mismatch), `slash` (`/` after `}` or after
  `of`/`yield`/`await` where regex or division is not provable), `htmlcomment`, `idescape`, `strescape` (octal escape in `["..."]`), `importparen`,
  `importargs`, `importmethod`, `chain` (receiver is a template, regex, number, `}`, keyword or `new (...)`), `arraylit` (`}[`), and
  `bare:<prev> _ <next>` for any bare `location` that is not provably a reference or binding (statement start `location = x`, `{location = 1}`, class
  fields, `[a, location] =`, labels, `import location`).
- **What changed in VERSION 2:** (1) the tokenizer keeps a real bracket stack (templates included): any mismatch, unterminated token or dangling
  operator at EOF bails, so a script the AST path cannot parse is never rewritten; (2) `/` is classified by the token before it (`)` of an
  if/while/for/with header, `}` block versus object literal, keywords, property names) and bails when unsure; (3) `declared` is decided per token:
  keyword binding, parameter list (arrow, function, method, catch; a line break before `{` is unsure), a `, location` item of a var/let/const list
  (walks the same bracket level, a line break not after a comma is unsure), `{location}` shorthand (object literal versus declaration pattern by the
  token before the `{`); a bare reference is edited only in operand position (after an operator, `typeof`, `return`, `(`/`,` in a non-parameter
  list, spread); everything else bails; (4) `[` and `(` after `)` is an index or call unless the `)` closes an if/while/for/with header, and
  `[`/`(` after `}` bails; array literal, parenthesised and string receivers are handled (`(a || b).location`, `(0, f)().location`); (5) bracket
  partners and enclosing openers are stored per token, so no backward scans (faster on big files); (6) `import(` that is a method name is skipped.
  Fixed: the scanner looped forever when the source ended in an identifier (EOF at a bare `location`), now bounded and covered by a test for every
  token kind at EOF.
- Still open: the second page-thread caveat (Worker 4x CPU numbers), `with` statements (same output as the AST path, no bail needed), templates as
  chain receivers (bail), and sources over 9 MB (one 12.5 MB bundle in the corpus is covered by `--max-mb 20`).
- Tests: `node --test tests/unit/tokrw.test.mjs` (hand cases, EOF cases, corpus parity when the corpus dir exists, 1000-program fuzz, both imp modes).

## Speed (VERSION 2, golden corpus, node 22, median of 3, shared machine so absolutes are inflated, ratios hold)
| bundle | KB | acorn ms | meriyah ms | scanner ms | vs acorn | vs meriyah |
|---|---|---|---|---|---|---|
| discord app (web.5233...) | 12556 | 6636 | 7107 | 807 | 8.2x | 8.8x |
| discord-2022 chunk | 5890 | 1540 | 1143 | 213 | 7.2x | 5.4x |
| desmos calculator | 5247 | 1871 | 1927 | 223 | 8.4x | 8.7x |
| spotify web-player | 4519 | 2823 | 5173 | 214 | 13.2x | 24.2x |
| netflix client | 3238 | 1628 | 1219 | 162 | 10.1x | 7.5x |

Median over the 5 biggest: **8.4x vs acorn, 8.7x vs meriyah**; whole golden corpus 23943 ms (acorn) against 2391 ms (scanner) = 10.0x, no bailouts.
4x CPU in the page and the Worker round trip were not measured (node only).

## Verdict against the spec's exit criteria
Median over the 5 big bundles at least 3x faster: met (8.4x on the golden corpus). Zero parity failures: met on the 111-file golden corpus (acorn and meriyah paths) and the fuzz. The four known gaps are closed.
The saving is the parse share of the 3 to 4.6 s first visit at 4x CPU.
