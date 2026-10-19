const { test, expect } = require('@playwright/test');

// Hosted copies share one storage instance per origin, so data survives new tabs and later visits.
test('a new tab on the same origin uses the same storage instance', async ({ context }) => {
  const a = await context.newPage();
  await a.goto('/index.html');
  await a.waitForSelector('#url', { state: 'attached' });
  const idA = await a.evaluate(() => localStorage.getItem('limitless:inst:v1'));
  expect(idA).toBeTruthy();

  const b = await context.newPage();
  await b.goto('/index.html');
  await b.waitForSelector('#url', { state: 'attached' });
  const idB = await b.evaluate(() => window._sessionInstId);
  expect(idB).toBe(idA);
});
