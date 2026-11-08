import { expect, test, type Page } from '@playwright/test';
import { SLIDES } from '../src/modes/slides-content';

/** Makes getUserMedia fail like a denied permission prompt, so "Use mouse instead" is offered. */
async function denyCamera(page: Page) {
  await page.addInitScript(() => {
    const md = navigator.mediaDevices ?? ({} as MediaDevices);
    md.getUserMedia = async () => {
      throw new DOMException('Permission denied', 'NotAllowedError');
    };
    if (!navigator.mediaDevices) Object.defineProperty(navigator, 'mediaDevices', { value: md });
  });
}

async function openMouseStage(page: Page, path = '/') {
  await denyCamera(page);
  await page.goto(path);
  await page.getByRole('button', { name: /try it/i }).click();
  await page.getByRole('button', { name: 'Use mouse instead' }).click();
}

/** Drags with the mouse between two points given as fractions of the drawing canvas. */
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = (await page.locator('canvas.draw-canvas').boundingBox())!;
  const pt = ([fx, fy]: [number, number]) => [box.x + fx * box.width, box.y + fy * box.height] as const;
  await page.mouse.move(...pt(from));
  await page.mouse.down();
  for (let i = 1; i <= 5; i++) {
    await page.mouse.move(...pt([from[0] + ((to[0] - from[0]) * i) / 5, from[1] + ((to[1] - from[1]) * i) / 5]));
  }
  await page.mouse.up();
}

/** True if any pixel of the drawing canvas is not fully transparent. */
const hasInk = (page: Page) =>
  page.locator('canvas.draw-canvas').evaluate((c: HTMLCanvasElement) => {
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
  });

test('the mouse alone can open Draw, draw, change colour, clear and go back to the menu', async ({ page }) => {
  await openMouseStage(page);
  const menu = page.getByRole('navigation', { name: 'Modes' });
  await expect(menu.getByRole('button', { name: /slides/i })).not.toContainText(/coming soon/i);
  await expect(menu.getByRole('button', { name: /catch.*coming soon/i })).toBeVisible();

  await menu.getByRole('button', { name: /draw/i }).click();
  await expect(page).toHaveURL(/[?&]mode=draw/);
  const draw = page.locator('.draw-mode');
  await expect(draw).toHaveAttribute('data-strokes', '0');
  expect(await hasInk(page)).toBe(false);

  await drag(page, [0.3, 0.5], [0.6, 0.6]);
  await expect(draw).toHaveAttribute('data-strokes', '1');
  expect(await hasInk(page)).toBe(true);

  const red = page.getByRole('button', { name: /red/i });
  await red.click();
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(draw).toHaveAttribute('data-strokes', '1'); // clicking a swatch doesn't leave a dot
  await page.keyboard.press('4');
  await expect(page.getByRole('button', { name: /blue/i })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Clear' }).click();
  await expect(draw).toHaveAttribute('data-strokes', '0');
  expect(await hasInk(page)).toBe(false);

  await drag(page, [0.2, 0.4], [0.4, 0.4]);
  await page.keyboard.press('c');
  await expect(draw).toHaveAttribute('data-strokes', '0');

  await page.getByRole('button', { name: 'Menu' }).click();
  await expect(menu).toBeVisible();
  await expect(draw).toHaveCount(0);
  await expect(page).not.toHaveURL(/mode=/);
});

test('?mode=draw opens Draw directly', async ({ page }) => {
  await page.goto('/?source=fixture:synthetic-wave&mode=draw');
  await expect(page.locator('.draw-mode')).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Modes' })).toHaveCount(0);
});

test('?mode=draw also opens Draw after "Use mouse instead"', async ({ page }) => {
  await openMouseStage(page, '/?mode=draw');
  await expect(page.locator('.draw-mode')).toBeVisible();
});

test('Slides: the arrow keys move through every slide and stop at the ends', async ({ page }) => {
  await openMouseStage(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /slides/i }).click();
  await expect(page).toHaveURL(/[?&]mode=slides/);
  const deck = page.getByRole('region', { name: 'Slides' });
  const heading = deck.getByRole('heading', { level: 2 });
  const counter = deck.locator('.slides-counter');
  const n = SLIDES.length;

  await expect(heading).toHaveText(SLIDES[0]!.title);
  await expect(counter).toHaveText(`1 / ${n}`);
  await page.keyboard.press('ArrowLeft'); // already at the start
  await expect(counter).toHaveText(`1 / ${n}`);

  for (let i = 1; i < n; i++) {
    await page.keyboard.press('ArrowRight');
    await expect(heading).toHaveText(SLIDES[i]!.title);
    await expect(counter).toHaveText(`${i + 1} / ${n}`);
  }
  await page.keyboard.press('ArrowRight'); // already at the end
  await expect(counter).toHaveText(`${n} / ${n}`);
  await expect(deck.getByRole('button', { name: 'Next slide' })).toBeDisabled();

  for (let i = n - 2; i >= 0; i--) {
    await page.keyboard.press('ArrowLeft');
    await expect(heading).toHaveText(SLIDES[i]!.title);
  }
  await expect(deck.getByRole('button', { name: 'Previous slide' })).toBeDisabled();

  // The on-screen buttons do the same.
  await deck.getByRole('button', { name: 'Next slide' }).click();
  await expect(counter).toHaveText(`2 / ${n}`);
  await deck.getByRole('button', { name: 'Previous slide' }).click();
  await expect(counter).toHaveText(`1 / ${n}`);
});

test('?mode=slides opens Slides directly', async ({ page }) => {
  await page.goto('/?source=fixture:synthetic-wave&mode=slides');
  await expect(page.getByRole('region', { name: 'Slides' })).toBeVisible();
});
