import { expect, test, type Page } from '@playwright/test';

/** Counts getUserMedia calls, and optionally makes them fail like a denied permission prompt. */
async function stubCamera(page: Page, { deny }: { deny: boolean }) {
  await page.addInitScript((deny) => {
    const w = window as unknown as { __cameraRequests: number };
    w.__cameraRequests = 0;
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = async () => {
      w.__cameraRequests++;
      if (deny) throw new DOMException('Permission denied', 'NotAllowedError');
      throw new DOMException('No camera in tests', 'NotFoundError');
    };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: md });
  }, deny);
}

const cameraRequests = (page: Page) => page.evaluate(() => (window as unknown as { __cameraRequests: number }).__cameraRequests);

/** A cheap fingerprint of the canvas pixels, to see that it keeps redrawing. */
const canvasPixels = (page: Page) => page.locator('canvas.overlay').evaluate((c: HTMLCanvasElement) => c.toDataURL());

async function expectMovingSkeleton(page: Page) {
  const canvas = page.locator('canvas.overlay');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((c: HTMLCanvasElement) => c.width)).toBe(640);
  const first = await canvasPixels(page);
  await expect.poll(() => canvasPixels(page), { timeout: 5000 }).not.toBe(first);
}

test('?source=fixture:synthetic-wave renders a moving skeleton without asking for the camera', async ({ page }) => {
  await stubCamera(page, { deny: false });
  await page.goto('/?source=fixture:synthetic-wave');
  await expectMovingSkeleton(page);
  await expect(page.getByRole('button', { name: 'Stop demo' })).toBeVisible();
  expect(await cameraRequests(page)).toBe(0);
});

test('a failure screen offers "Use mouse instead" and "Watch a demo", and the demo plays', async ({ page }) => {
  await stubCamera(page, { deny: true });
  await page.goto('/');
  await page.getByRole('button', { name: /try it/i }).click();

  await expect(page.getByRole('heading', { name: 'Camera access is blocked' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use mouse instead' })).toBeVisible();
  const watchDemo = page.getByRole('button', { name: 'Watch a demo' });
  await expect(watchDemo).toBeVisible();

  await watchDemo.click();
  await expectMovingSkeleton(page);
  await page.getByRole('button', { name: 'Stop demo' }).click();
  await expect(page.getByRole('button', { name: /try it/i })).toBeVisible();
});
