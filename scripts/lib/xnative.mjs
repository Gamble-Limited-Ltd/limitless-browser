// MS-1 pure logic (docs/1.3/specs/01-measuring.md): "x native" ratios and a blocked-page check.
export const PHASES = ['cold', 'warm'];
export const MARKS = ['shown', 'load'];

/** A native load that hit a bot wall or an error status is "native blocked", not a ratio. */
export const looksBlocked = (status, title = '') => status >= 400 || /just a moment|access denied|attention required|captcha|are you a robot|verify you are human/i.test(title);

/** Ratio rows: one per site, phase and mark. Limitless median / native median. */
export function ratios(limitless, native) {
  const rows = [];
  for (const [name, l] of Object.entries(limitless.sites || {})) {
    const n = native.sites?.[name];
    for (const phase of PHASES) for (const mark of MARKS) {
      const lm = l?.[phase]?.[mark]?.median ?? null;
      const nm = n?.[phase]?.[mark]?.median ?? null;
      let note = 'ok', ratio = null;
      if (!n) note = 'no native run';
      else if (n.blocked) note = 'native blocked';
      else if (lm == null) note = 'no limitless number';
      else if (!nm) note = 'no native number';
      else ratio = Math.round((lm / nm) * 100) / 100;
      rows.push({ site: name, phase, mark, limitless: lm, native: nm, ratio, note });
    }
  }
  return rows;
}

/** Markdown table; ratios read "2.1x". */
export function table(rows) {
  const out = ['| site | phase | mark | Limitless ms | native ms | x native |', '|---|---|---|---|---|---|'];
  for (const r of rows) out.push(`| ${r.site} | ${r.phase} | ${r.mark} | ${r.limitless ?? '-'} | ${r.native ?? '-'} | ${r.ratio != null ? `${r.ratio}x` : r.note} |`);
  return out.join('\n');
}
