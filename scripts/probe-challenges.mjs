#!/usr/bin/env node
// Challenge rate on challenge-prone sites, per vantage (home = this machine, vps = `ssh limitless-relay`, advisory) and per header set
// (old = 1.0 app headers, new = 1.1 request hygiene). docs/1.1/BOTCHECK.md, docs/1.0/TESTING.md section 10.
//   node scripts/probe-challenges.mjs [--vantage=home,vps] [--reps=3] [--ua="<real browser UA>"] [--json] [--sites=a.com,b.com]
// Plain GETs of site front pages with system curl (its TLS handshake is curl's, not the app's libcurl.js, so absolute rates differ
// from the app; the point is the comparison between vantages and header sets). No credentials, no CAPTCHA solving, no retries
// past the rep count, 1.5 s between requests. The verdict uses the app's own detector (LB_botCheck from app/ui.js).
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const reps = Number(arg('reps', 3)), vantages = arg('vantage', 'home,vps').split(',');
const UA = arg('ua', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36');
const SITES = (arg('sites', '') ? arg('sites', '').split(',') : ['www.cloudflare.com', 'discord.com', 'www.reddit.com', 'www.zillow.com', 'www.ticketmaster.com', 'www.nike.com',
  'www.walmart.com', 'www.glassdoor.com', 'www.indeed.com', 'www.g2.com', 'www.etsy.com', 'www.linkedin.com', 'www.medium.com', 'www.bestbuy.com', 'www.target.com', 'www.stackoverflow.com']).map((h) => `https://${h}/`);

// The app's detector, taken from the source so the two cannot drift.
const src = readFileSync(fileURLToPath(new URL('../app/ui.js', import.meta.url)), 'utf8');
const a = src.indexOf('window.LB_botCheck = function'), b = src.indexOf('\n    };\n', a) + 7;
const ctx = { window: {}, feat: () => true }; vm.createContext(ctx); vm.runInContext(src.slice(a, b), ctx);
const botCheck = ctx.window.LB_botCheck;

const chrome = (ua) => /Chrome\/(\d+)/.exec(ua)?.[1];
const SETS = {
  old: () => [['User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.7778.96 Safari/537.36'], ['Origin', 'https://TARGET'], ['Referer', 'https://TARGET/'],
    ['Accept-Language', 'en-US,en;q=0.9'], ['Sec-Fetch-Mode', 'navigate'], ['Sec-Fetch-Site', 'none'], ['Sec-Fetch-Dest', 'document'], ['Sec-Fetch-User', '?1']],
  new: () => [['sec-ch-ua', `"Chromium";v="${chrome(UA)}", "Google Chrome";v="${chrome(UA)}", "Not.A/Brand";v="99"`], ['sec-ch-ua-mobile', '?0'], ['sec-ch-ua-platform', '"Linux"'], ['Upgrade-Insecure-Requests', '1'],
    ['User-Agent', UA], ['Accept', 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7'],
    ['Sec-Fetch-Site', 'none'], ['Sec-Fetch-Mode', 'navigate'], ['Sec-Fetch-User', '?1'], ['Sec-Fetch-Dest', 'document'], ['Accept-Language', 'en-US,en;q=0.9']],
};
const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
function curlCmd(url, set) {
  const host = new URL(url).host, h = SETS[set]().map(([k, v]) => `-H ${q(`${k}: ${v.replace('TARGET', host)}`)}`).join(' ');
  // -A '' drops curl's own UA (ours is in the list); the Accept: */* of curl is replaced by our Accept in the new set
  return `curl -sS --http2 --compressed -m 20 -o - -D - ${set === 'old' ? '' : "-H 'Accept:'"} ${h} ${q(url)}`;
}
function run(vantage, cmd) {
  const r = vantage === 'home' ? spawnSync('bash', ['-c', cmd], { encoding: 'utf8', maxBuffer: 20e6 }) : spawnSync('ssh', ['-o', 'BatchMode=yes', 'limitless-relay', cmd], { encoding: 'utf8', maxBuffer: 20e6 });
  return r.stdout || '';
}
function verdict(out) {
  const parts = out.split(/\r?\n\r?\n/); let i = 0;
  while (i < parts.length - 1 && /^HTTP\/[\d.]+ 1\d\d|^HTTP\/[\d.]+ 30\d/.test(parts[i])) i++;   // skip 1xx and redirect heads
  const head = parts[i] || '', body = parts.slice(i + 1).join('\n\n');
  const st = Number((/^HTTP\/[\d.]+ (\d+)/.exec(head) || [])[1] || 0);
  const h = {}; for (const l of head.split(/\r?\n/).slice(1)) { const m = /^([^:]+):\s*(.*)$/.exec(l); if (m) h[m[1].toLowerCase()] = m[2]; }
  if (!st) return 'error';
  if (botCheck(st, body, h)) return 'challenge';
  return st >= 400 ? 'blocked' : st >= 300 ? 'redirect' : 'ok';
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const res = {};
for (const v of vantages) for (const set of ['old', 'new']) {
  const k = `${v}/${set}`; res[k] = { ok: 0, redirect: 0, challenge: 0, blocked: 0, error: 0, n: 0, sites: {} };
  for (const url of SITES) for (let i = 0; i < reps; i++) {
    const r = verdict(run(v, curlCmd(url, set))); res[k][r]++; res[k].n++; (res[k].sites[new URL(url).host] ||= []).push(r);
    await sleep(1500);
  }
}
if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
else {
  console.log(`${new Date().toISOString()}  ${SITES.length} sites x ${reps} reps, UA ${UA}`);
  for (const [k, r] of Object.entries(res)) console.log(`${k.padEnd(9)} n=${r.n}  ok ${r.ok}  redirect ${r.redirect}  challenge ${r.challenge}  blocked ${r.blocked}  error ${r.error}`);
  for (const [k, r] of Object.entries(res)) console.log(`\n${k}\n` + Object.entries(r.sites).map(([s, v]) => `  ${s.padEnd(24)} ${v.join(' ')}`).join('\n'));
}
