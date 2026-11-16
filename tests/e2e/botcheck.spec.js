// 1.1 slice botcheck, Part A: LB_botCheck(status, html, headers) flags real interstitial challenge pages only (docs/1.1/BOTCHECK.md).
const { test, expect } = require('@playwright/test');
const { boot } = require('./helpers');

const pad = (n) => '<p>' + 'Some real page text. '.repeat(n) + '</p>';
const CF = { server: 'cloudflare', 'cf-ray': '8a1b2c-ORD' };
const cfJs = '<!DOCTYPE html><html><head><title>Just a moment...</title></head><body><script>window._cf_chl_opt={cvId:"3"};</script><script src="/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1"></script></body></html>';

// [name, status, html, headers, expected]
const CASES = [
  // true positives
  ['cloudflare managed challenge (header)', 403, '<html><body>Enable JavaScript</body></html>', { 'cf-mitigated': 'challenge' }, true],
  ['cloudflare just a moment', 403, cfJs, CF, true],
  ['cloudflare just a moment on 503', 503, cfJs, CF, true],
  ['cloudflare attention required', 403, '<title>Attention Required! | Cloudflare</title><div class="cf-error-details">Please complete the security check</div>', CF, true],
  ['akamai access denied', 403, '<html><head><title>Access Denied</title></head><body>You do not have permission. Reference #18.5a1b2c3d.1700000000.abc <a href="https://errors.edgesuite.net/18.5a">x</a></body></html>', { server: 'AkamaiGHost' }, true],
  ['perimeterx press and hold', 403, '<html><head><title>Access to this page has been denied</title></head><body><div id="px-captcha"></div><p>Press &amp; Hold to confirm you are a human</p></body></html>', {}, true],
  ['datadome', 403, '<html><head><title>x</title></head><body><iframe src="https://geo.captcha-delivery.com/captcha/?initialCid=x"></iframe></body></html>', { server: 'DataDome' }, true],
  ['imperva incapsula', 403, '<html><body>Request unsuccessful. Incapsula incident ID: 123-456</body></html>', { 'x-iinfo': '1' }, true],
  ['captcha is the page', 429, '<html><head><title>Verify you are human</title></head><body><h1>Please verify you are human</h1><div class="g-recaptcha" data-sitekey="k"></div><script src="https://www.google.com/recaptcha/api.js"></script></body></html>', {}, true],
  ['turnstile is the page', 403, '<title>Security check</title><p>Verify you are human</p><div class="cf-turnstile"></div>', {}, true],
  // false positives the old substring test hit
  ['login page embedding recaptcha, long', 403, '<title>Sign in</title><form><input name=u><div class="g-recaptcha"></div></form>' + pad(2500), {}, false],
  ['short 403 login with recaptcha and real text', 403, '<title>Sign in</title><h1>Sign in to your account</h1><p>' + 'Your session expired. Please sign in again to continue to your dashboard and settings. '.repeat(6) + '</p><div class="g-recaptcha"></div>', {}, false],
  ['hcaptcha on a long error page', 503, '<title>Error</title><script src="https://hcaptcha.com/1/api.js"></script>' + pad(3000), {}, false],
  ['cloudflare site, ordinary 403 with the analytics snippet', 403, '<title>Forbidden</title><h1>Forbidden</h1><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>', CF, false],
  ['plain 403', 403, '<h1>Forbidden</h1>', {}, false],
  ['plain 503', 503, '<h1>Service Unavailable</h1>', { server: 'nginx' }, false],
  ['challenge text on a 200', 200, cfJs, CF, false],
  ['challenge text on a 404', 404, cfJs, CF, false],
  ['blog about captchas', 403, '<title>How reCAPTCHA works</title>' + pad(1500) + '<div class="g-recaptcha"></div>', {}, false],
];

test('bot check: real interstitials are flagged, ordinary error and login pages are not', async ({ page }) => {
  await boot(page);
  const got = await page.evaluate((cases) => cases.map(([, st, html, h]) => window.LB_botCheck(st, html, h)), CASES);
  CASES.forEach((c, i) => expect.soft(got[i], c[0]).toBe(c[4]));
});

test('bot check: headers are optional and features.botCard=false restores the old substring test', async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const noHdr = window.LB_botCheck(403, '<title>Just a moment...</title>');
    const long = '<div class="g-recaptcha"></div>' + 'text '.repeat(20000);
    const on = window.LB_botCheck(403, long, {});
    window.LB_features.botCard = false;
    const off = window.LB_botCheck(403, long, {});
    window.LB_features.botCard = true;
    return [noHdr, on, off];
  });
  expect(r).toEqual([false, false, true]);
});
