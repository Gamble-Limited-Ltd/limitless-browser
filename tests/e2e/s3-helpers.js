const { boot } = require('./helpers');

// Shared by the S3 specs: the libcurl stub from pipeline.spec.js plus small helpers.
const SETUP = `
  window.__net = { log: [], script: {} };
  window.__respond = (url, r) => { window.__net.script[url] = r; };
  window.LB_net.curl = {
    active_requests: 0, close() {}, set_connections() {},
    async fetch(url, o) {
      const h = {}; for (const [k, v] of Object.entries(o.headers || {})) h[k.toLowerCase()] = v;
      window.__net.log.push({ url, headers: h, t: performance.now() });
      const r = window.__net.script[url] || { status: 404, headers: {}, body: 'nope' };
      if (r.delay) await new Promise((res) => setTimeout(res, r.delay));
      const bytes = new TextEncoder().encode(r.body);
      return { status: r.status || 200, headers: new Headers(r.headers || {}), arrayBuffer: async () => bytes.buffer.slice(0) };
    },
  };
  window.__count = (re) => window.__net.log.filter((x) => re.test(x.url)).length;
  window.__big = (n = 500) => {
    const parts = [];
    for (let i = 0; i < n; i++) parts.push('function f' + i + '(){ var a = window.location.href; var b = document.location; location = "x' + i + '"; }');
    return parts.join('\\n');
  };
  window.__marks = () => { const c = window.__lbPerf.cur; return c ? { ...c.marks } : {}; };
  window.__waitMark = (name, ms) => new Promise((res) => {
    const t0 = performance.now();
    const iv = setInterval(() => { const m = window.__marks(); if (m[name] != null || performance.now() - t0 > ms) { clearInterval(iv); res(m); } }, 20);
  });
`;

async function setup(page, init) {
  const errors = await boot(page, init ? { init } : {});
  await page.evaluate(SETUP);
  return errors;
}

module.exports = { SETUP, setup };
