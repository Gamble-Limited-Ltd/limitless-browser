const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { boot } = require('./helpers');

// SPEED.md 3.6: the head theme script preloads only the active theme's display and body faces.
const fontsCss = fs.readFileSync(path.join(__dirname, '..', '..', 'theme', 'fonts.css'), 'utf8');
const CASES = { luxury: ['bodonimoda', 'jost'], retro: ['vt323', 'ibmplexmono'], vault: ['playfairdisplay', 'dmsans'] };

for (const [theme, faces] of Object.entries(CASES)) {
  test(`preloads the ${theme} faces only`, async ({ page }) => {
    await boot(page, { init: (t) => localStorage.setItem('limitless:theme:v1', JSON.stringify({ theme: t, mode: 'dark', mark: 'orbit' })), arg: theme });
    const hrefs = await page.evaluate(() => [...document.querySelectorAll('link[rel=preload][as=font]')].map((l) => [l.getAttribute('href'), l.crossOrigin, l.type]));
    expect(hrefs.map((h) => h[0].split('/')[2])).toEqual(faces);
    for (const [href, co, type] of hrefs) {
      expect(co).toBe('anonymous');
      expect(type).toBe('font/woff2');
      expect(fontsCss).toContain(`url(${href.replace(/^theme\//, '')})`); // same URL the @font-face asks for, or the preload is wasted
    }
  });
}
