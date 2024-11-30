import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page, context }) => {
  // Grant autoplay permission
  await context.grantPermissions([], { origin: 'http://localhost:5173' });
  
  // Navigate to the local Vite development server
  await page.goto('http://localhost:5173');
});

test('play/pause button reflects isPlaying state', async ({ page }) => {
  const audioPlayer = page.locator('audio-player');

  // Capture console logs from the page
  page.on('console', (msg) => {
    console.log('PAGE LOG:', msg.text());
  });

  // Locate play/pause button and text
  const playPauseButton = audioPlayer.locator('.playPauseButton');
  const buttonText = playPauseButton.locator('span');

  // Ensure isPlaying is accessible
  const isPlayingProperty = await page.evaluate(() => {
    const player = document.querySelector('audio-player');
    return typeof player.isPlaying !== 'undefined';
  });
  expect(isPlayingProperty).toBeTruthy();

  // Get initial isPlaying state
  let isPlaying = await page.evaluate(() => {
    const player = document.querySelector('audio-player');
    return player.isPlaying;
  });
});

test('play/pause button updates text based on isPlaying state', async ({ page }) => {
await page.evaluate(() => {
  const player = document.querySelector('audio-player');
  const audio = player.shadowRoot.querySelector('#audioPlayer');

  // Mock the play method
  audio.play = function () {
    this.dispatchEvent(new Event('play'));
  };

  // Mock the pause method
  audio.pause = function () {
    this.dispatchEvent(new Event('pause'));
  };
});
});

test('handles error state', async ({ page }) => {
  // Mock fetch to simulate error
  await page.route('https://api.kexp.org/v2/plays*', (route) => {
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' })
    });
  });

  // Reload page to trigger error
  await page.reload();
  
  // Wait for error to be displayed
  await page.waitForTimeout(2000);
  
  // Find the audio player
  const audioPlayer = page.locator('audio-player');
  
  // Check error message
  const errorMessage = audioPlayer.locator('.errorMessage');
  await expect(errorMessage).toBeVisible();
});

test('marquee effect applied correctly', async ({ page }) => {
  // Wait for fetch to complete
  await page.waitForTimeout(2000);
  
  // Find the audio player
  const audioPlayer = page.locator('audio-player');
  
  // Check marquee wrapper and marquee elements
  const marqueeWrapper = audioPlayer.locator('.marqueeWrapper');
  const marquee = audioPlayer.locator('.marquee');
  
  await expect(marqueeWrapper).toBeVisible();
  await expect(marquee).toBeVisible();
  
  // Check for scrolling class if text is long
  const marqueeText = await marquee.textContent();
  const marqueeWidth = await marquee.evaluate(el => el.scrollWidth);
  const wrapperWidth = await marqueeWrapper.evaluate(el => el.offsetWidth);
  
  if (marqueeWidth > wrapperWidth) {
    await expect(marquee).toHaveClass(/scrolling/);
  }
});

test('volume set correctly', async ({ page }) => {
  // Initialize the audio to set the volume
  await page.evaluate(() => {
    const player = document.querySelector('audio-player');
    player.initializeAudio();
  });

  // Interact with shadow DOM to get audio element and check volume
  const initialVolume = await page.evaluate(() => {
    const player = document.querySelector('audio-player');
    const audio = player.shadowRoot.querySelector('#audioPlayer');
    return audio.volume;
  });
  expect(initialVolume).toBeCloseTo(0.03, 2); // Use toBeCloseTo for floating point numbers
});
