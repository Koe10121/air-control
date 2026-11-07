import { expect, test, type Page } from '@playwright/test';

// Chromium's fake camera (a test pattern), so the live path can load the real model. Fixture mode
// never asks for the camera, so this doesn't affect it.
test.use({
  launchOptions: { args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] },
  permissions: ['camera'],
});

/** Records every request to an origin other than the site's own, and every CSP violation. */
function watchPrivacy(page: Page, siteOrigin: string) {
  const external: string[] = [];
  page.on('request', (req) => {
    const url = new URL(req.url());
    if (url.protocol === 'data:' || url.protocol === 'blob:') return;
    if (url.origin !== siteOrigin) external.push(req.url());
  });
  const violations: string[] = [];
  page.on('console', (msg) => {
    if (/Content Security Policy/i.test(msg.text())) violations.push(msg.text());
  });
  return { external, violations };
}

const canvasPixels = (page: Page) => page.locator('canvas.overlay').evaluate((c: HTMLCanvasElement) => c.toDataURL());

test('fixture mode sends no request to any other origin and breaks no CSP rule', async ({ page, baseURL }) => {
  const seen = watchPrivacy(page, new URL(baseURL!).origin);

  const response = await page.goto('/?source=fixture:synthetic-wave');
  expect(response?.headers()['content-security-policy']).toContain("connect-src 'self'");

  const first = await canvasPixels(page);
  await expect.poll(() => canvasPixels(page), { timeout: 5000 }).not.toBe(first);

  expect(seen.external).toEqual([]);
  expect(seen.violations).toEqual([]);
});

test('with a fake camera, the MediaPipe model loads and runs under the CSP, from this site only', async ({ page, baseURL }) => {
  const seen = watchPrivacy(page, new URL(baseURL!).origin);
  await page.goto('/');
  const modelLoaded = page.waitForResponse((r) => r.url().endsWith('/mediapipe/hand_landmarker.task') && r.ok());
  const wasmLoaded = page.waitForResponse((r) => /\/mediapipe\/wasm\/.+\.wasm$/.test(r.url()) && r.ok());
  await page.getByRole('button', { name: /try it/i }).click();
  await Promise.all([modelLoaded, wasmLoaded]);

  // The status line is cleared only once the model is built and the tracker is running;
  // a failure would replace the live view with an error screen instead.
  await expect(page.getByRole('status')).toBeHidden({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Stop camera' })).toBeVisible();
  await expect(page.getByRole('heading')).toHaveCount(0);

  expect(seen.external).toEqual([]);
  expect(seen.violations).toEqual([]);
});
