const { test, expect } = require('@playwright/test');

test.describe('Audio Player Web Component', () => {
  test('Ensure .audioPlayer inside <audio-player> is accessible', async ({ page }) => {
    // Navigate to the page
    await page.goto('http://localhost:5173/audioPlayer');

    // Verify that the <audio-player> component exists
    const audioPlayer = page.locator('audio-player');
    await expect(audioPlayer).toHaveCount(1); // Ensure the Web Component is present

    // Locate the .audioPlayer inside the Shadow DOM
    const audioPlayerDiv = page.locator('audio-player >> .audioPlayer');

    // Verify the .audioPlayer is visible
    await expect(audioPlayerDiv).toBeVisible();
  });
});
