// Golden corpus fetcher: node tools/cl15/fetch-corpus.mjs [outDir]
// Public front pages only, no cookies, no logins. Saves script files of 16 KB+ as <site>-<short>.js plus manifest.json.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
const out = process.argv[2] || path.join(process.env.HOME, '.cache/limitless-fixtures/bundles');
fs.mkdirSync(out, { recursive: true });
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const SITES = {
  steam: 'https://store.steampowered.com/', reddit: 'https://www.reddit.com/', discordapp: 'https://discord.com/app', discord: 'https://discord.com/',
  classroom: 'https://classroom.google.com/', quizlet: 'https://quizlet.com/', desmos: 'https://www.desmos.com/calculator', khan: 'https://www.khanacademy.org/',
  kahoot: 'https://kahoot.it/', createkahoot: 'https://create.kahoot.it/', gimkit: 'https://www.gimkit.com/', coolmath: 'https://www.coolmathgames.com/',
  wikipedia: 'https://en.wikipedia.org/wiki/Main_Page', bbc: 'https://www.bbc.com/', nytimes: 'https://www.nytimes.com/', github: 'https://github.com/',
  stackoverflow: 'https://stackoverflow.com/', amazon: 'https://www.amazon.com/', twitch: 'https://www.twitch.tv/', tumblr: 'https://www.tumblr.com/',
  duckduckgo: 'https://duckduckgo.com/', bing: 'https://www.bing.com/', medium: 'https://medium.com/', imdb: 'https://www.imdb.com/', espn: 'https://www.espn.com/',
  cnn: 'https://www.cnn.com/', weather: 'https://weather.com/', spotify: 'https://open.spotify.com/', canva: 'https://www.canva.com/', notion: 'https://www.notion.so/',
  ebay: 'https://www.ebay.com/', etsy: 'https://www.etsy.com/', walmart: 'https://www.walmart.com/', docs: 'https://docs.google.com/', pinterest: 'https://www.pinterest.com/',
  linkedin: 'https://www.linkedin.com/', netflix: 'https://www.netflix.com/', roblox: 'https://www.roblox.com/', npmjs: 'https://www.npmjs.com/', mdn: 'https://developer.mozilla.org/en-US/',
};
const get = async (url, bin) => {
  const r = await fetch(url, { headers: { 'user-agent': UA, accept: '*/*', 'accept-language': 'en-US,en;q=0.9' }, redirect: 'follow', signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return bin ? Buffer.from(await r.arrayBuffer()) : await r.text();
};
const manifest = [], seen = new Set();
for (const [site, page] of Object.entries(SITES)) {
  let html;
  try { html = await get(page); } catch (e) { console.log('skip', site, e.message); continue; }
  const urls = new Set();
  for (const m of html.matchAll(/(?:src|href)=["']([^"'#]+?\.m?js(?:\?[^"']*)?)["']/g)) { try { urls.add(new URL(m[1].replace(/&amp;/g, '&'), page).href); } catch {} }
  for (const m of html.matchAll(/["'](https?:\/\/[^"'\s\\]+?\.js)["']/g)) urls.add(m[1]);
  // one level of chunk discovery from the biggest entry scripts
  let k = 0, n = 0;
  const queue = [...urls].slice(0, 25);
  for (const u of queue) {
    if (n >= 5) break;
    let buf; try { buf = await get(u, true); } catch { continue; }
    if (buf.length < 16384) continue;
    const sha = crypto.createHash('sha256').update(buf).digest('hex');
    if (seen.has(sha)) continue; seen.add(sha);
    const short = (path.basename(new URL(u).pathname, '.js').replace(/[^\w.-]+/g, '_').slice(0, 30) || 'x') + '-' + sha.slice(0, 6);
    const name = `${site}-${short}.js`;
    fs.writeFileSync(path.join(out, name), buf);
    manifest.push({ file: name, url: u, size: buf.length, sha256: sha, date: new Date().toISOString().slice(0, 10) });
    n++;
  }
  console.log(site, n, 'files');
}
fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
console.log('total', manifest.length, 'files,', new Set(manifest.map(m => m.file.split('-')[0])).size, 'sites');
