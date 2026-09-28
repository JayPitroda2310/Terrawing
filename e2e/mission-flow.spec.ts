import { expect, test, type Page } from '@playwright/test';

interface Snapshot {
  gameplay: string | null;
  objectives: Record<string, string>;
}

/** Reads the dev-only state probe installed by src/app/devHooks.ts. */
async function snapshot(page: Page): Promise<Snapshot | undefined> {
  return page.evaluate(() => (window as unknown as { __tw?: () => Snapshot }).__tw?.());
}

test('main menu → briefing → mission → pause/resume → abort', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: /terrawing/i })).toBeVisible();

  await page.getByRole('button', { name: /start mission/i }).click();
  await page.getByRole('button', { name: /skip story/i }).click();
  await expect(page.getByRole('heading', { name: /mountain collapse/i })).toBeVisible();
  await expect(page.getByText('3 CIVILIANS MISSING')).toBeVisible();

  await page.getByRole('button', { name: /begin rescue/i }).click();
  await expect(page.getByTestId('cinematic')).toBeVisible({ timeout: 150_000 });

  // Skip the intro and take control in rover mode.
  await page.keyboard.press('KeyE');
  await expect(page.getByTestId('hud')).toBeVisible();
  await expect.poll(async () => (await snapshot(page))?.gameplay).toBe('ROVER');

  // Transform to flight and climb: the deploy objective completes.
  await page.keyboard.press('KeyE');
  await expect
    .poll(async () => (await snapshot(page))?.gameplay, { timeout: 25_000 })
    .toBe('FLIGHT');
  await page.keyboard.down('Space');
  await expect
    .poll(async () => (await snapshot(page))?.objectives.deploy, { timeout: 25_000 })
    .toBe('completed');
  await page.keyboard.up('Space');

  // Pause and resume.
  await page.keyboard.press('Escape');
  await expect(page.getByText('Operation paused')).toBeVisible();
  await page.getByRole('button', { name: 'Resume' }).click();
  await expect(page.getByTestId('hud')).toBeVisible();

  // Abort to the main menu.
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /abort mission/i }).click();
  await expect(page.getByRole('heading', { name: /terrawing/i })).toBeVisible();

  expect(errors).toEqual([]);
});

test('settings persist across reloads', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  const toggle = page.getByRole('switch', { name: 'Camera shake' });
  await expect(toggle).toHaveAttribute('aria-checked', 'true');
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', 'false');
  await page.waitForTimeout(500);

  await page.reload();
  await page.getByRole('button', { name: /settings/i }).click();
  await page.getByRole('tab', { name: 'Gameplay' }).click();
  await expect(page.getByRole('switch', { name: 'Camera shake' })).toHaveAttribute(
    'aria-checked',
    'false',
  );
});
