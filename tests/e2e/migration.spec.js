const { test, expect } = require('@playwright/test');

// Storage migration: gust:* -> limitless:* (copy, keep old keys, never overwrite newer values).
// The app namespaces most keys per session as "gi_<id>:<key>"; a few are stored bare.
const INST = 'gi_migtest';
const TABS = {
  tabs: [
    { id: 1, title: 'New Tab', url: 'gust://newtab', history: [], historyIndex: -1 },
    { id: 2, title: 'Settings', url: 'gust://settings/about', history: [], historyIndex: -1 },
  ],
  activeTabId: 1,
  nextTabId: 3,
};

test('gust:* keys are copied to limitless:* once, old keys stay, tabs restore', async ({ page }) => {
  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));

  await page.addInitScript(([inst, tabs]) => {
    // Seed only on the very first load of this test; reloads must see what the app wrote.
    if (localStorage.getItem('__seeded')) return;
    localStorage.setItem('__seeded', '1');
    // The previous release kept its per-tab instance id under this sessionStorage key.
    sessionStorage.setItem('__gust_inst__', inst);
    localStorage.setItem(inst + ':gust:tabs:v1', JSON.stringify(tabs));
    localStorage.setItem(inst + ':gust:favorites:v1', JSON.stringify([{ name: 'Home', url: 'gust://newtab' }]));
    localStorage.setItem(inst + ':gust:custom-search-name:v1', 'MyEngine');
    localStorage.setItem('gust:cookies:v1', '[]');
    localStorage.setItem('gust:pagels:v1', '{"example.com":{"k":"v"}}');
  }, [INST, TABS]);

  await page.goto('/index.html');
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });

  const read = () => page.evaluate((inst) => {
    const g = (k) => localStorage.getItem(k);
    return {
      flag: g('limitless:migrated:v1'),
      tabsNew: g(inst + ':limitless:tabs:v1'),
      tabsOld: g(inst + ':gust:tabs:v1'),
      favNew: g(inst + ':limitless:favorites:v1'),
      favOld: g(inst + ':gust:favorites:v1'),
      nameNew: g(inst + ':limitless:custom-search-name:v1'),
      cookiesNew: g('limitless:cookies:v1'),
      cookiesOld: g('gust:cookies:v1'),
      pagelsNew: g('limitless:pagels:v1'),
    };
  }, INST);

  let s = await read();
  expect(Date.parse(s.flag)).not.toBeNaN();
  expect(s.tabsNew).not.toBeNull();
  expect(s.tabsOld).not.toBeNull(); // old keys are kept for one release
  expect(s.favOld).not.toBeNull();
  expect(s.cookiesOld).toBe('[]');
  expect(s.nameNew).toBe('MyEngine');
  expect(s.cookiesNew).toBe('[]');
  expect(s.pagelsNew).toBe('{"example.com":{"k":"v"}}');
  // Internal URLs inside stored values move to the new scheme.
  expect(s.favNew).toContain('limitless://newtab');
  expect(s.favNew).not.toContain('gust://');

  // The app restored the two saved tabs and normalized their URLs.
  await expect(page.locator('#tabStrip .tab, .tab[data-tab-id]')).toHaveCount(2, { timeout: 15000 });
  const saved = JSON.parse((await read()).tabsNew);
  expect(saved.tabs.map((t) => t.id)).toEqual([1, 2]);
  expect(saved.tabs.every((t) => !String(t.url).startsWith('gust://'))).toBe(true);

  // Second load: a newer limitless:* value must not be overwritten by the old key.
  await page.evaluate((inst) => {
    localStorage.setItem(inst + ':limitless:custom-search-name:v1', 'NewerEngine');
    localStorage.removeItem('limitless:migrated:v1'); // even if the flag were lost, existing new keys win
  }, INST);
  await page.reload();
  await expect(page.locator('#url')).toBeVisible({ timeout: 30000 });
  s = await read();
  expect(s.nameNew).toBe('NewerEngine');
  expect(Date.parse(s.flag)).not.toBeNaN();
  expect(s.cookiesOld).toBe('[]');

  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
