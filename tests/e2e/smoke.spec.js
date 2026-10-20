const { test, expect } = require('@playwright/test');

// Third-party hosts (CDNs, relays) may be unreachable in a sandbox.
const isLocal = (url) => url.startsWith(`http://127.0.0.1:${process.env.LB_E2E_PORT || '8599'}/`);

test('app shell loads without uncaught errors and the address bar works', async ({ page }) => {
  const pageErrors = [];
  const networkNotes = [];
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  page.on('requestfailed', (req) => {
    if (!isLocal(req.url())) networkNotes.push(`${req.url()} ${req.failure()?.errorText}`);
  });

  await page.goto('/index.html');

  // The address bar is the most stable marker that the shell is ready.
  const url = page.locator('#url');
  await expect(url).toBeVisible({ timeout: 30000 });

  expect((await page.title()).trim().length).toBeGreaterThan(0);

  // A first-run tutorial overlay may cover the bar, so focus and type without pointer events.
  await url.focus();
  await url.fill('example.com');
  await expect(url).toHaveValue('example.com');

  await page.waitForTimeout(1000);
  if (networkNotes.length) console.log('Ignored third-party network failures:\n' + networkNotes.join('\n'));
  expect(pageErrors, pageErrors.join('\n')).toEqual([]);
});
