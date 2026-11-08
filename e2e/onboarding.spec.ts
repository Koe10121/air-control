import { expect, test, type Page } from '@playwright/test';

/** A camera prompt that never answers: the live view (and so the onboarding) stays up with no real camera. */
async function pendingCamera(page: Page) {
  await page.addInitScript(() => {
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = () => new Promise<MediaStream>(() => {});
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: md });
  });
}

test('onboarding shows on the first camera start, Skip opens the menu, and it stays gone after a reload', async ({ page }) => {
  await pendingCamera(page);
  await page.goto('/');
  await page.getByRole('button', { name: /try it/i }).click();
  const onboarding = page.getByRole('region', { name: 'Getting started' });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toHaveAttribute('data-step', 'hand');
  await expect(onboarding).toContainText('Raise your hand');

  await onboarding.getByRole('button', { name: 'Skip' }).click();
  await expect(onboarding).toHaveCount(0);
  const menu = page.getByRole('navigation', { name: 'Modes' });
  await expect(menu).toBeVisible();
  await expect(page).not.toHaveURL(/mode=/);

  await page.reload();
  await page.getByRole('button', { name: /try it/i }).click();
  await expect(menu).toBeVisible();
  await expect(onboarding).toHaveCount(0);
});

test('a ?mode= deep link skips the onboarding', async ({ page }) => {
  await pendingCamera(page);
  await page.goto('/?mode=draw');
  await page.getByRole('button', { name: /try it/i }).click();
  await expect(page.locator('.draw-mode')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0);
});

test('the fixture demo never shows the onboarding', async ({ page }) => {
  await page.goto('/?source=fixture:synthetic-wave');
  await expect(page.getByRole('navigation', { name: 'Modes' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0);
});
