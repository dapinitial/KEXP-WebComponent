const { test, expect } = require('@playwright/test');

test('AudioPlayer loads correctly', async ({ page }) => {
  await page.goto('http://localhost:3000');
  const audioPlayer = await page.$('audio-player');
  expect(audioPlayer).not.toBeNull();
});

test('Play/Pause button toggles', async ({ page }) => {
  await page.goto('http://localhost:3000');
  const button = await page.locator('audio-player').shadow().locator('.playPauseButton');
  await expect(button).toHaveText('Play');

  await button.click();
  await expect(button).toHaveText('Pause');
});