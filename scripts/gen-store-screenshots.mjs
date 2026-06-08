// Generates store-listing screenshots (1280×800) into docs/store-assets/
// using whatever KEXP is actually playing — re-run when you want fresher
// shots. Read-only: the production backend is walled off, the playlist is
// seeded locally from recent real plays. Run from the repo root:
//   node scripts/gen-store-screenshots.mjs
import { chromium } from '@playwright/test';
import { createServer } from 'vite';

const OUT = 'docs/store-assets';
const PORT = 5199;

// Recent real plays → local playlist fixture (most recent first).
const plays = await (await fetch('https://api.kexp.org/v2/plays/?limit=24')).json();
const tracks = plays.results
  .filter((p) => p.play_type === 'trackplay' && p.song && p.thumbnail_uri)
  .slice(0, 6)
  .map((p, i) => [
    `${p.artist}|${p.song}`,
    {
      artist: p.artist,
      song: p.song,
      airdate: p.airdate,
      album: p.album ?? null,
      releaseDate: p.release_date ?? null,
      thumbnail: p.thumbnail_uri,
      label: p.labels?.[0] ?? null,
      comment: null,
      note: null,
      isLocal: Boolean(p.is_local),
      isLive: Boolean(p.is_live),
      isRequest: Boolean(p.is_request),
      likedAt: new Date(Date.now() - i * 8 * 60_000).toISOString(),
    },
  ]);
console.log(`seeding ${tracks.length} real plays as likes`);

const server = await createServer({ server: { port: PORT, strictPort: true } });
await server.listen();

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await page.route('https://jodgbwwnbrotuceanghk.supabase.co/**', (r) => r.abort());
await page.addInitScript((entries) => {
  if (localStorage.getItem('kexp-player:seeded')) return;
  localStorage.setItem('kexp-player:seeded', '1');
  localStorage.setItem('kexp-player:likes', JSON.stringify(entries));
}, tracks);

await page.goto(`http://localhost:${PORT}/`);
const player = page.locator('audio-player');
await player.locator('.playPauseButton').waitFor();
// Give now-playing data and album art a moment to land.
await page.waitForTimeout(4000);
console.log('on air:', await player.locator('.marquee').textContent());

await page.screenshot({ path: `${OUT}/screenshot-1-now-playing.png` });
console.log(`wrote ${OUT}/screenshot-1-now-playing.png`);

await player.locator('.playlistChip').click();
// Let the 3D flip finish before shooting.
await page.waitForFunction(() => {
  const sr = document.querySelector('audio-player').shadowRoot;
  return [
    ...sr.querySelector('.flipCard').getAnimations(),
    ...sr.querySelector('.flipInner').getAnimations(),
  ].every((a) => a.playState === 'finished');
});
await page.waitForTimeout(1000); // thumbnails
await page.screenshot({ path: `${OUT}/screenshot-2-playlist.png` });
console.log(`wrote ${OUT}/screenshot-2-playlist.png`);

await browser.close();
await server.close();
process.exit(0);
