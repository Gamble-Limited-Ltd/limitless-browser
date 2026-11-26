// TS-8: one markdown table per release (docs/1.3/baseline/<version>.md) from the candidate's speed JSON files, medians and n.
const m = (x) => (x && x.median != null ? String(x.median) : '-');

// speeds = { <project>: speed-<sha>-<project>.json parsed }
export function baselineMd({ version, sha, date, harness, speeds }) {
  const out = [`# Baseline ${version}`, '', `Build ${sha}, run ${date}, harness ${harness}. Medians in ms; n = reps per row. Reference for the "x native" table and for ads (every published number names its profile, median and n).`, ''];
  for (const [project, j] of Object.entries(speeds)) {
    out.push(`## ${project}`, '', '| site | n | cold shown | cold load | warm shown | warm load |', '|---|---|---|---|---|---|');
    for (const [name, s] of Object.entries(j.sites || {})) out.push(`| ${name} | ${s.cold?.runs ?? '-'} | ${m(s.cold?.shown)} | ${m(s.cold?.load)} | ${m(s.warm?.shown)} | ${m(s.warm?.load)} |`);
    const b = j.boot || {};
    out.push(`| boot (cold / repeat, interactive) | ${b.cold?.runs ?? '-'} | ${m(b.cold?.interactive)} | - | ${m(b.repeat?.interactive)} | - |`, '');
  }
  return out.join('\n');
}
