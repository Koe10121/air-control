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
  await expect(menu.getByRole('button', { name: /catch/i })).not.toContainText(/coming soon/i);

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

test('Catch: a mouse-only game starts, runs, pauses with Space, ends and shows the score', async ({ page }) => {
  await page.clock.install();
  await openMouseStage(page);
  await page.getByRole('navigation', { name: 'Modes' }).getByRole('button', { name: /catch/i }).click();
  await expect(page).toHaveURL(/[?&]mode=catch/);
  const game = page.getByRole('region', { name: 'Catch' });
  await expect(game).toHaveAttribute('data-phase', 'ready');

  await game.getByRole('button', { name: 'Start' }).click();
  await expect(game).toHaveAttribute('data-phase', 'playing');
  const box = (await page.locator('canvas.catch-canvas').boundingBox())!;
  for (let i = 0; i <= 10; i++) await page.mouse.move(box.x + (box.width * i) / 10, box.y + box.height * 0.8);
  await page.clock.runFor(10_000);
  const time = game.locator('.catch-time');
  await expect(time).toHaveText('20 s');

  await page.keyboard.press(' ');
  await expect(game).toHaveAttribute('data-phase', 'paused');
  await page.clock.runFor(5_000);
  await expect(time).toHaveText('20 s');
  await page.keyboard.press(' ');
  await expect(game).toHaveAttribute('data-phase', 'playing');

  await page.clock.runFor(21_000);
  await expect(game).toHaveAttribute('data-phase', 'over');
  const score = await game.getAttribute('data-score');
  await expect(game.getByRole('heading', { name: `Score: ${score}` })).toBeVisible();
  await expect(game.getByRole('button', { name: 'Play again' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('air-control:catch-best'))).toBe(score);

  await game.getByRole('button', { name: 'Play again' }).click();
  await expect(game).toHaveAttribute('data-phase', 'playing');
});

test('recorder (hidden ?mode=record) captures a fixture clip and downloads landmarks-only schema v1', async ({ page }) => {
  test.setTimeout(40_000);
  await page.goto('/?source=fixture:open-palm-hold&mode=record');
  await expect(page.getByRole('heading', { name: 'Recorder' })).toBeVisible();
  await page.locator('select[name="label"]').selectOption('open_palm');
  await page.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('.record-clips li')).toHaveText(/open_palm: \d+ samples/, { timeout: 20_000 });

  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('.record-export').click()]);
  const text = await (await download.createReadStream()).toArray().then((chunks) => Buffer.concat(chunks).toString());
  const data = JSON.parse(text);
  expect(data.schemaVersion).toBe(1);
  // ~10 s at ~10 Hz; the fixture loops, so a short no-hand gap at each restart may drop a few.
  expect(data.samples.length).toBeGreaterThan(80);
  expect(data.samples.length).toBeLessThanOrEqual(101);
  expect(Object.keys(data.samples[0]).sort()).toEqual(['handedness', 'label', 'landmarks', 'lighting', 'participant', 'session', 'timestamp']);
  expect(data.samples[0].label).toBe('open_palm');
  expect(text).not.toMatch(/image|base64/);
});

test('the recorder is not on the mode menu', async ({ page }) => {
  await page.goto('/?source=fixture:open-palm-hold');
  await expect(page.locator('.mode-button')).toHaveCount(3);
  await expect(page.locator('.mode-button[data-mode="record"]')).toHaveCount(0);
});

test('benchmark (hidden ?mode=benchmark): a mouse-only run hits all 20 targets at 100% and offers the JSON', async ({ page }) => {
  await openMouseStage(page, '/?mode=benchmark');
  const bench = page.getByRole('region', { name: 'Benchmark' });
  await expect(bench).toHaveAttribute('data-phase', 'ready');
  await bench.getByRole('button', { name: 'Start' }).click();
  await expect(bench).toHaveAttribute('data-phase', 'running');

  const target = bench.locator('.benchmark-target');
  // Sized via the CSSOM: the CSP blocks inline style attributes, which would leave it 0 px wide.
  expect((await target.boundingBox())!.width).toBeGreaterThan(20);
  for (let i = 0; i < 20; i++) {
    await expect(bench).toHaveAttribute('data-index', String(i));
    const box = (await target.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(bench).toHaveAttribute('data-phase', 'done');
  await expect(bench).toHaveAttribute('data-success-rate', '1');
  await expect(bench.getByRole('heading', { name: 'Results' })).toBeVisible();
  await expect(bench).toContainText('100% success');
  const result = JSON.parse(await bench.getByRole('textbox', { name: 'Results JSON' }).inputValue());
  expect(result).toMatchObject({ benchmark: 'targets-v1', targets: 20, hits: 20, misses: 0, successRate: 1, input: 'mouse', classifier: null });
  await expect(bench.getByRole('button', { name: 'Copy JSON' })).toBeVisible();
  await expect(page.locator('.mode-button[data-mode="benchmark"]')).toHaveCount(0);
});
