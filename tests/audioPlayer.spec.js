import { test, expect } from '@playwright/test';

const API_PATTERN = 'https://api.kexp.org/v2/plays*';
const STREAM_PATTERN = 'https://kexp.streamguys1.com/**';

const playFixture = (overrides = {}) => ({
  results: [
    {
      artist: 'Mudhoney',
      song: 'Touch Me I\'m Sick',
      airdate: '2026-06-06T10:00:00-07:00',
      ...overrides,
    },
  ],
});

// Replace the real stream + audio methods so tests never open a network stream.
const mockAudioElement = () => {
  const player = document.querySelector('audio-player');
  const audio = player.shadowRoot.querySelector('#audioPlayer');
  audio.load = () => {};
  audio.play = function () {
    Object.defineProperty(this, 'paused', { value: false, configurable: true });
    this.dispatchEvent(new Event('play'));
    return Promise.resolve();
  };
  audio.pause = function () {
    Object.defineProperty(this, 'paused', { value: true, configurable: true });
    this.dispatchEvent(new Event('pause'));
  };
};

test.beforeEach(async ({ page }) => {
  await page.route(STREAM_PATTERN, (route) => route.abort());
  await page.route(API_PATTERN, (route) =>
    route.fulfill({ json: playFixture() })
  );
  await page.goto('/');
});

test('renders the player and now-playing info from the API', async ({ page }) => {
  const player = page.locator('audio-player');
  const button = player.locator('.playPauseButton');
  const marquee = player.locator('.marquee');

  await expect(button).toBeVisible();
  await expect(button).toHaveText(/PLAY/);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(marquee).toHaveText(
    'Listening to: Mudhoney - Touch Me I\'m Sick on 90.3 FM Seattle'
  );
});

test('toggles playback state and UI on button click', async ({ page }) => {
  await page.evaluate(mockAudioElement);

  const player = page.locator('audio-player');
  const button = player.locator('.playPauseButton');
  const iconBars = player.locator('.iconBars');

  await button.click();
  await expect(button).toHaveText(/PAUSE/);
  await expect(button).toHaveAttribute('aria-pressed', 'true');
  await expect(iconBars).toHaveClass(/animating/);
  expect(
    await page.evaluate(() => document.querySelector('audio-player').isPlaying)
  ).toBe(true);

  await button.click();
  await expect(button).toHaveText(/PLAY/);
  await expect(button).toHaveAttribute('aria-pressed', 'false');
  await expect(iconBars).not.toHaveClass(/animating/);
  expect(
    await page.evaluate(() => document.querySelector('audio-player').isPlaying)
  ).toBe(false);
});

test('shows an error when the API fails but keeps the player usable', async ({ page }) => {
  await page.route(API_PATTERN, (route) =>
    route.fulfill({ status: 500, json: { error: 'Internal Server Error' } })
  );
  await page.reload();

  const player = page.locator('audio-player');
  await expect(player.locator('.errorMessage')).toBeVisible();
  await expect(player.locator('.errorMessage')).toHaveText('Now playing info unavailable.');
  // The stream is independent of the metadata API — the button must survive.
  await expect(player.locator('.playPauseButton')).toBeVisible();
});

test('clears the error once the API recovers', async ({ page }) => {
  // Fail every request until the test explicitly flips the API healthy —
  // robust against browsers issuing extra requests around reloads.
  let apiHealthy = false;
  await page.route(API_PATTERN, (route) => {
    if (!apiHealthy) {
      return route.fulfill({ status: 500, json: { error: 'oops' } });
    }
    return route.fulfill({ json: playFixture() });
  });
  await page.reload();

  const player = page.locator('audio-player');
  await expect(player.locator('.errorMessage')).toBeVisible();

  // Speed up polling, then let the API recover.
  await page.evaluate(() =>
    document.querySelector('audio-player').setAttribute('poll-interval', '200')
  );
  apiHealthy = true;

  await expect(player.locator('.errorMessage')).toBeHidden();
  await expect(player.locator('.marquee')).toContainText('Mudhoney');
});

test('dispatches track-changed when a new play arrives', async ({ page }) => {
  // Let the initial fetch settle first, so the only remaining track-changed
  // event is the one for the new track below.
  await expect(page.locator('audio-player .marquee')).toContainText('Mudhoney');

  // Serve a different track than the one loaded in beforeEach.
  await page.route(API_PATTERN, (route) =>
    route.fulfill({
      json: playFixture({
        artist: 'Sleater-Kinney',
        song: 'Dig Me Out',
        airdate: '2026-06-06T10:05:00-07:00',
      }),
    })
  );

  const detail = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const player = document.querySelector('audio-player');
        player.addEventListener('track-changed', (e) => resolve(e.detail), { once: true });
        // Restarting the poll triggers an immediate refetch.
        player.setAttribute('poll-interval', '200');
      })
  );

  expect(detail.artist).toBe('Sleater-Kinney');
  expect(detail.song).toBe('Dig Me Out');
});

test('marquee scrolls only when the text overflows', async ({ page }) => {
  // Headless browsers force prefers-reduced-motion, which the component
  // correctly honors — emulate a user with no such preference.
  await page.emulateMedia({ reducedMotion: 'no-preference' });

  const player = page.locator('audio-player');
  const marquee = player.locator('.marquee');

  const isAnimating = () =>
    marquee.evaluate((el) => el.getAnimations().some((a) => a.playState === 'running'));

  // Wide viewport: short text fits, no scrolling.
  await page.setViewportSize({ width: 1280, height: 400 });
  await expect(marquee).toHaveText(/Mudhoney/);
  await expect.poll(isAnimating).toBe(false);

  // Narrow viewport: text overflows, scrolling kicks in (after the resize debounce).
  await page.setViewportSize({ width: 240, height: 400 });
  await expect.poll(isAnimating).toBe(true);
});

test('respects the volume attribute', async ({ page }) => {
  await page.evaluate(mockAudioElement);
  await page.evaluate(() =>
    document.querySelector('audio-player').setAttribute('volume', '0.2')
  );

  await page.locator('audio-player .playPauseButton').click();

  const volume = await page.evaluate(
    () => document.querySelector('audio-player').shadowRoot.querySelector('#audioPlayer').volume
  );
  expect(volume).toBeCloseTo(0.2, 2);
});

test('disables liking during air breaks', async ({ page }) => {
  // KEXP airbreak plays have null artist/song — they must not be likeable.
  await page.route(API_PATTERN, (route) =>
    route.fulfill({
      json: playFixture({ artist: null, song: null, play_type: 'airbreak' }),
    })
  );
  await page.reload();

  const player = page.locator('audio-player');
  await expect(player.locator('.marquee')).toContainText('Air break');
  await expect(player.locator('.likeButton')).toBeDisabled();
});

test('liking a song never triggers playback', async ({ page }) => {
  await page.evaluate(mockAudioElement);

  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');

  // Heart is disabled until the first track loads.
  await expect(like).toBeEnabled();
  await like.click();

  // Liked — but playback untouched.
  await expect(like).toHaveAttribute('aria-pressed', 'true');
  await expect(like).toHaveClass(/liked/);
  await expect(player.locator('.playPauseButton')).toHaveText(/PLAY/);
  expect(
    await page.evaluate(() => document.querySelector('audio-player').isPlaying)
  ).toBe(false);

  // Toggle off.
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
  await expect(like).not.toHaveClass(/liked/);
});

test('likes persist across reload and build the playlist', async ({ page }) => {
  const like = page.locator('audio-player .likeButton');

  await expect(like).toBeEnabled();
  await like.click();
  await expect(like).toHaveAttribute('aria-pressed', 'true');

  await page.reload();

  // Same track is playing after reload — heart remembers.
  await expect(like).toBeEnabled();
  await expect(like).toHaveAttribute('aria-pressed', 'true');

  const playlist = await page.evaluate(() => document.querySelector('audio-player').playlist);
  expect(playlist).toHaveLength(1);
  expect(playlist[0].artist).toBe('Mudhoney');
  expect(playlist[0].song).toBe('Touch Me I\'m Sick');
});

test('dispatches like-changed with track and device details', async ({ page }) => {
  await expect(page.locator('audio-player .likeButton')).toBeEnabled();

  const detail = await page.evaluate(
    () =>
      new Promise((resolve) => {
        const player = document.querySelector('audio-player');
        player.addEventListener('like-changed', (e) => resolve(e.detail), { once: true });
        player.shadowRoot.querySelector('.likeButton').click();
      })
  );

  expect(detail.liked).toBe(true);
  expect(detail.artist).toBe('Mudhoney');
  expect(detail.song).toBe('Touch Me I\'m Sick');
  expect(detail.playlistSize).toBe(1);
  expect(detail.deviceId).toMatch(/^[0-9a-f-]{36}$/);
});

test('playlist chip flips to the playlist and back', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');

  await expect(like).toBeEnabled();
  await like.click();

  await player.locator('.playlistChip').click();
  await expect(player.locator('.flipCard')).toHaveClass(/flipped/);
  await expect(player.locator('.cardBack')).toHaveJSProperty('inert', false);
  await expect(player.locator('.cardFront')).toHaveJSProperty('inert', true);
  await expect(player.locator('.playlist li')).toHaveText(/Mudhoney — Touch Me I'm Sick/);

  await player.locator('.flipBackButton').click();
  await expect(player.locator('.flipCard')).not.toHaveClass(/flipped/);
  await expect(player.locator('.cardFront')).toHaveJSProperty('inert', false);
  await expect(player.locator('.cardBack')).toHaveJSProperty('inert', true);
});

test('removing a song asks for confirmation first', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');

  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  const row = player.locator('.playlist li');
  await row.locator('.removeButton').click();
  await expect(row.locator('.rowConfirm')).toBeVisible();

  // Cancel keeps the song.
  await row.locator('.confirmNo').click();
  await expect(row.locator('.rowConfirm')).toBeHidden();
  await expect(player.locator('.playlist li')).toHaveCount(1);

  // Confirming removes it and unfills the heart.
  await row.locator('.removeButton').click();
  await row.locator('.confirmYes').click();
  await expect(player.locator('.playlist li')).toHaveCount(0);
  await expect(player.locator('.playlistEmpty')).toBeVisible();

  await player.locator('.flipBackButton').click();
  await expect(like).toHaveAttribute('aria-pressed', 'false');
});

test('emails the playlist to the entered address', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');

  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  await player.locator('.emailInput').fill('me@davidpuerto.com');
  await player.locator('.emailButton').click();

  const href = await player.locator('.emailLink').getAttribute('href');
  expect(href).toContain('mailto:me%40davidpuerto.com');
  expect(href).toContain(encodeURIComponent('Mudhoney — Touch Me I\'m Sick'));
  expect(href).toContain(encodeURIComponent('KEXP 90.3 FM Seattle'));
});

test('clamps invalid volume values to a safe default', async ({ page }) => {
  const volumes = await page.evaluate(() => {
    const player = document.querySelector('audio-player');
    const readings = [];
    player.setAttribute('volume', 'not-a-number');
    readings.push(player.volume);
    player.setAttribute('volume', '5');
    readings.push(player.volume);
    player.setAttribute('volume', '-1');
    readings.push(player.volume);
    return readings;
  });

  expect(volumes[0]).toBe(0.5); // default
  expect(volumes[1]).toBe(1); // clamped high
  expect(volumes[2]).toBe(0); // clamped low
});
