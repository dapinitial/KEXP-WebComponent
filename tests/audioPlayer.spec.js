import { test, expect } from '@playwright/test';

const API_PATTERN = 'https://api.kexp.org/v2/plays*';
const STREAM_PATTERN = 'https://kexp.streamguys1.com/**';

const playFixture = (overrides = {}) => ({
  results: [
    {
      artist: 'Mudhoney',
      song: 'Touch Me I\'m Sick',
      airdate: '2026-06-06T10:00:00-07:00',
      album: 'Superfuzz Bigmuff',
      release_date: '1988-10-01',
      thumbnail_uri: 'https://images.test/superfuzz.jpg',
      labels: ['Sub Pop'],
      comment: 'The song that started it all — Sub Pop single number one era.',
      is_local: true,
      is_live: false,
      is_request: false,
      show: 5234,
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
  // index.html ships wired to the PRODUCTION backend — wall it off so test
  // fixtures never sync into the real database. (Ask me how I know.)
  await page.route('https://jodgbwwnbrotuceanghk.supabase.co/**', (route) => route.abort());
  await page.route(STREAM_PATTERN, (route) => route.abort());
  await page.route(API_PATTERN, (route) =>
    route.fulfill({ json: playFixture() })
  );
  await page.route('https://api.kexp.org/v2/shows/**', (route) =>
    route.fulfill({
      json: { program_name: 'The Midday Show', host_names: ['Cheryl Waters'] },
    })
  );
  await page.route('https://images.test/**', (route) =>
    route.fulfill({
      contentType: 'image/png',
      body: Buffer.from(
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        'base64'
      ),
    })
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

  // No album art: give the marquee the full row so the wide viewport fits.
  await page.route(API_PATTERN, (route) =>
    route.fulfill({ json: playFixture({ thumbnail_uri: null }) })
  );
  await page.reload();

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

  // Block the mailto: navigation — otherwise the headless browser hands the
  // protocol to macOS and Mail.app pops open on every test run.
  await page.evaluate(() => {
    document
      .querySelector('audio-player')
      .shadowRoot.querySelector('.emailLink')
      .addEventListener('click', (e) => e.preventDefault());
  });

  await player.locator('.emailInput').fill('me@davidpuerto.com');
  await player.locator('.emailButton').click();

  const href = await player.locator('.emailLink').getAttribute('href');
  expect(href).toContain('mailto:me%40davidpuerto.com');
  expect(href).toContain(encodeURIComponent('Mudhoney — Touch Me I\'m Sick'));
  expect(href).toContain(encodeURIComponent('KEXP 90.3 FM Seattle'));
});

const BACKEND = 'https://backend.test';

const routeBackend = async (page, { playlist = [], count = 0, posts = [] } = {}) => {
  await page.route(`${BACKEND}/rest/v1/likes`, (route) => {
    posts.push(route.request().postDataJSON());
    route.fulfill({ status: 201, json: [] });
  });
  await page.route(`${BACKEND}/rest/v1/rpc/device_playlist`, (route) =>
    route.fulfill({ json: playlist })
  );
  await page.route(`${BACKEND}/rest/v1/rpc/song_like_count`, (route) =>
    route.fulfill({ json: count })
  );
  await page.route(`${BACKEND}/rest/v1/rpc/remove_like`, (route) => route.fulfill({ json: null }));
};

const attachBackend = (page) =>
  page.evaluate((backend) => {
    const player = document.querySelector('audio-player');
    player.setAttribute('backend-url', backend);
    player.setAttribute('backend-key', 'test-key');
  }, BACKEND);

test('shows the global like count and syncs likes to the backend', async ({ page }) => {
  const posts = [];
  await routeBackend(page, { count: 11, posts });
  await attachBackend(page);

  const player = page.locator('audio-player');
  const likeCount = player.locator('.likeCount');

  // Global count arrives from the backend.
  await expect(likeCount).toHaveText('11');

  // Liking bumps it optimistically and POSTs to the backend.
  await player.locator('.likeButton').click();
  await expect(likeCount).toHaveText('12');
  await expect.poll(() => posts.length).toBe(1);
  expect(posts[0].artist).toBe('Mudhoney');
  expect(posts[0].song).toBe('Touch Me I\'m Sick');
  expect(posts[0].device_id).toMatch(/^[0-9a-f-]{36}$/);
});

test('merges the device cloud playlist into local likes on startup', async ({ page }) => {
  await routeBackend(page, {
    playlist: [
      {
        artist: 'La Luz',
        song: 'Call Me in the Day',
        airdate: '2026-06-05T18:00:00Z',
        liked_at: '2026-06-05T18:01:00Z',
      },
    ],
  });
  await attachBackend(page);

  const player = page.locator('audio-player');

  // Cloud song lands in the chip count and the playlist.
  await expect(player.locator('.chipCount')).toHaveText('1');
  await player.locator('.playlistChip').click();
  await expect(player.locator('.playlist li')).toHaveText(/La Luz — Call Me in the Day/);
});

test('player works fine when the backend is unreachable', async ({ page }) => {
  await page.route(`${BACKEND}/**`, (route) => route.abort());
  await attachBackend(page);

  const player = page.locator('audio-player');
  await expect(player.locator('.marquee')).toContainText('Mudhoney');

  // Liking still works locally; count stays hidden at 0... then optimistic +1.
  await player.locator('.likeButton').click();
  await expect(player.locator('.likeButton')).toHaveAttribute('aria-pressed', 'true');
  await expect(player.locator('.errorMessage')).toBeHidden();
});

test('playlist rows link to a YouTube search for the song', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');

  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  const youtube = player.locator('.playlist li .youtubeLink');
  await expect(youtube).toHaveAttribute(
    'href',
    `https://www.youtube.com/results?search_query=${encodeURIComponent("Mudhoney Touch Me I'm Sick")}`
  );
  await expect(youtube).toHaveAttribute('target', '_blank');
});

test('hovering an artist shows a Wikipedia card', async ({ page }) => {
  await page.route('https://en.wikipedia.org/api/rest_v1/page/summary/**', (route) =>
    route.fulfill({
      json: {
        title: 'Mudhoney',
        extract: 'Mudhoney is an American rock band formed in Seattle in 1988.',
        thumbnail: null,
        content_urls: { desktop: { page: 'https://en.wikipedia.org/wiki/Mudhoney' } },
      },
    })
  );

  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  await player.locator('.playlist li .artistLink').hover();

  const card = player.locator('.hoverCard');
  await expect(card).toBeVisible();
  await expect(card.locator('.hoverCardTitle')).toHaveText('Mudhoney');
  await expect(card.locator('.hoverCardExtract')).toContainText('formed in Seattle');
  await expect(card.locator('.hoverCardLink')).toHaveAttribute(
    'href',
    'https://en.wikipedia.org/wiki/Mudhoney'
  );

  // Card hides when the pointer leaves (after the grace delay).
  await player.locator('.playlistTitle').hover();
  await expect(card).toBeHidden();
});

test('artists without a Wikipedia page get a friendly fallback card', async ({ page }) => {
  await page.route('https://en.wikipedia.org/api/rest_v1/page/summary/**', (route) =>
    route.fulfill({ status: 404, json: { title: 'Not found' } })
  );

  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  await player.locator('.playlist li .artistLink').hover();

  const card = player.locator('.hoverCard');
  await expect(card).toBeVisible();
  await expect(card.locator('.hoverCardTitle')).toHaveText('Mudhoney');
  await expect(card.locator('.hoverCardMeta')).toContainText('too underground');
});

test('pencil toggles the note editor closed, saving the note', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  const pencil = player.locator('.playlist li .noteButton');
  await pencil.click();
  await player.locator('.playlist li .noteInput').fill('toggle me');
  await pencil.click(); // toggle closed = save

  await expect(player.locator('.playlist li .noteInput')).toBeHidden();
  await expect(player.locator('.playlist li .noteText')).toHaveText('“toggle me”');
});

test('legacy likes without art get backfilled from KEXP play history', async ({ page }) => {
  // A like saved before we stored album art.
  await page.addInitScript(() => {
    localStorage.setItem(
      'kexp-player:likes',
      JSON.stringify([
        [
          'La Luz|Call Me in the Day',
          { artist: 'La Luz', song: 'Call Me in the Day', airdate: '2026-06-01T12:00:00Z', likedAt: '2026-06-01T12:01:00Z' },
        ],
      ])
    );
  });
  await page.route(API_PATTERN, (route) => {
    const url = route.request().url();
    if (url.includes('artist_exact=La')) {
      return route.fulfill({
        json: {
          results: [
            {
              artist: 'La Luz',
              song: 'Call Me in the Day',
              album: 'It\'s Alive',
              release_date: '2013-10-15',
              thumbnail_uri: 'https://images.test/itsalive.jpg',
              labels: ['Hardly Art'],
            },
          ],
        },
      });
    }
    return route.fulfill({ json: playFixture() });
  });
  await page.reload();

  const player = page.locator('audio-player');
  await player.locator('.playlistChip').click();

  const row = player.locator('.playlist li', { hasText: 'La Luz' });
  await expect(row.locator('.albumArt img')).toHaveAttribute(
    'src',
    'https://images.test/itsalive.jpg'
  );
});

test('album art opens a track card with album, year, label, and DJ notes', async ({ page }) => {
  await page.route('https://images.test/**', (route) =>
    route.fulfill({ contentType: 'image/png', body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') })
  );

  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  // Row shows the album art thumbnail.
  await expect(player.locator('.playlist li .albumArt img')).toHaveAttribute(
    'src',
    'https://images.test/superfuzz.jpg'
  );

  await player.locator('.playlist li .albumArt').hover();

  const card = player.locator('.hoverCard');
  await expect(card).toBeVisible();
  await expect(card.locator('.hoverCardTitle')).toHaveText('Mudhoney — Touch Me I\'m Sick');
  await expect(card.locator('.hoverCardMeta')).toContainText('From “Superfuzz Bigmuff”');
  await expect(card.locator('.hoverCardMeta')).toContainText('released 1988');
  await expect(card.locator('.hoverCardMeta')).toContainText('on Sub Pop');
  await expect(card.locator('.hoverCardExtract')).toContainText('Sub Pop single number one');
  await expect(card.locator('.hoverCardBadges .badge')).toHaveText('SEATTLE LOCAL');
});

test('ellipsized playlist titles marquee on hover', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await page.route(API_PATTERN, (route) =>
    route.fulfill({
      json: playFixture({
        artist: 'King Gizzard & The Lizard Wizard',
        song: 'The Dripping Tap (Extended Live Rehearsal Version)',
      }),
    })
  );
  await page.reload();
  await page.setViewportSize({ width: 420, height: 700 });

  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  const title = player.locator('.playlist li .trackTitle');
  const isScrolling = () =>
    title
      .locator('.trackScroll')
      .evaluate((el) => el.getAnimations().some((a) => a.playState === 'running'));

  await title.hover();
  await expect.poll(isScrolling).toBe(true);
  await expect(title).toHaveClass(/scrolling/);

  await player.locator('.playlistTitle').hover();
  await expect.poll(isScrolling).toBe(false);
});

test('personal notes: add, persist, and ride along in the email', async ({ page }) => {
  const player = page.locator('audio-player');
  const like = player.locator('.likeButton');
  await expect(like).toBeEnabled();
  await like.click();
  await player.locator('.playlistChip').click();

  // Add a note via the pencil.
  await player.locator('.playlist li .noteButton').click();
  await player.locator('.playlist li .noteInput').fill('Road trip to Tahoe, windows down');
  await player.locator('.playlist li .noteInput').press('Enter');
  await expect(player.locator('.playlist li .noteText')).toHaveText(
    '“Road trip to Tahoe, windows down”'
  );
  await expect(player.locator('.playlist li .noteButton')).toHaveClass(/hasNote/);

  // Survives a reload.
  await page.reload();
  await player.locator('.playlistChip').click();
  await expect(player.locator('.playlist li .noteText')).toContainText('Road trip to Tahoe');

  // And the email carries the whole story: meta, DJ notes, personal note.
  await page.evaluate(() => {
    document
      .querySelector('audio-player')
      .shadowRoot.querySelector('.emailLink')
      .addEventListener('click', (e) => e.preventDefault());
  });
  await player.locator('.emailInput').fill('me@davidpuerto.com');
  await player.locator('.emailButton').click();

  const href = await player.locator('.emailLink').getAttribute('href');
  const body = decodeURIComponent(href.split('&body=')[1]);
  expect(body).toContain('Mudhoney — Touch Me I\'m Sick (Superfuzz Bigmuff, 1988, Sub Pop)');
  expect(body).toContain('Seattle local');
  expect(body).toContain('DJ: The song that started it all');
  expect(body).toContain('Me: Road trip to Tahoe, windows down');
});

test('front face shows album art and the on-air show with host', async ({ page }) => {
  const player = page.locator('audio-player');

  await expect(player.locator('.nowArt')).toHaveAttribute(
    'src',
    'https://images.test/superfuzz.jpg'
  );
  await expect(player.locator('.showLine')).toHaveText('The Midday Show · Cheryl Waters');

  // Airbreaks have no art.
  await page.route(API_PATTERN, (route) =>
    route.fulfill({
      json: playFixture({ artist: null, song: null, thumbnail_uri: null, play_type: 'airbreak' }),
    })
  );
  await page.reload();
  await expect(player.locator('.marquee')).toContainText('Air break');
  await expect(player.locator('.nowArt')).toBeHidden();
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
