// Generates the macOS tray template icons: idle KEXP wordmark plus a playing
// variant with the player's EQ bars (static — animating the tray flickers).
// Template images only use the alpha channel, so everything is rendered
// black on transparent. Run from the repo root:
//   node src-tauri/gen-tray-icons.mjs
import { chromium } from '@playwright/test';

// The KEXP wordmark path from src/audioPlayer.js (viewBox 0 0 90 40).
const KEXP_PATH =
  'M9.56,38 L9.56,24.96 L10.32,23.68 L15,38 L22.28,38 L16,20.24 L22,5.6 L15,5.6 L9.56,18.84 L9.56,5.6 L2.4,5.6 L2.4,38 L9.56,38 Z M41.22,38 L41.22,33.16 L33.74,33.16 L33.74,23.48 L39.38,23.48 L39.38,18.52 L33.74,18.52 L33.74,10.48 L41.14,10.48 L41.14,5.6 L26.58,5.6 L26.58,38 L41.22,38 Z M50.88,5.6 L54.44,14.36 L57.32,5.6 L63.28,5.6 L57.6,22.44 L63.92,38 L57.2,38 L53.24,28.32 L49.76,38 L43.84,38 L50.12,20.56 L44.12,5.6 L50.88,5.6 Z M78.94,5.6 C80.8866667,5.6 82.4866667,5.96666667 83.74,6.7 C84.9933333,7.43333333 85.9266667,8.5 86.54,9.9 C87.1533333,11.3 87.46,13 87.46,15 C87.46,17.5066667 87.0466667,19.42 86.22,20.74 C85.3933333,22.06 84.2733333,22.9733333 82.86,23.48 C81.4466667,23.9866667 79.86,24.24 78.1,24.24 L75.22,24.24 L75.22,38 L68.06,38 L68.06,5.6 L78.94,5.6 Z M77.58,10.64 L75.22,10.64 L75.22,19.24 L77.62,19.24 C78.5,19.24 79.1666667,19.08 79.62,18.76 C80.0733333,18.44 80.3733333,17.96 80.52,17.32 C80.6666667,16.68 80.74,15.8666667 80.74,14.88 C80.74,14.0533333 80.68,13.3266667 80.56,12.7 C80.44,12.0733333 80.1533333,11.5733333 79.7,11.2 C79.2466667,10.8266667 78.54,10.64 77.58,10.64 Z';

// 2x pixels for an 18pt-tall retina menu-bar icon.
const H = 36;
const WORDMARK_W = 72; // 90:40 aspect at 32px tall, with 2px vertical margin
const BARS_W = 26; // 4 bars × 4px + 3 × 3px gaps + 5px gap to wordmark
// Bar heights sampled from the component's up-down animation at t=0.25 —
// a pleasingly uneven equalizer pose.
const BAR_HEIGHTS = [21, 27.7, 14.9, 21];

const page = await (await chromium.launch()).newPage();

async function shoot(width, bars, path) {
  const barsHtml = bars
    ? bars
        .map(
          (h, i) =>
            `<div style="position:absolute;left:${i * 7}px;bottom:2px;width:4px;height:${h.toFixed(1)}px;background:#000"></div>`
        )
        .join('')
    : '';
  await page.setViewportSize({ width, height: H });
  await page.setContent(`
    <body style="margin:0;background:transparent">
      <div style="position:relative;width:${width}px;height:${H}px">
        ${barsHtml}
        <svg style="position:absolute;right:0;top:2px" width="${WORDMARK_W}" height="32"
             viewBox="0 0 90 40"><path fill="#000" d="${KEXP_PATH}"/></svg>
      </div>
    </body>`);
  await page.screenshot({ path, omitBackground: true });
  console.log('wrote', path);
}

// Idle: wordmark only. Playing: EQ bars + wordmark.
await shoot(WORDMARK_W, null, 'src-tauri/icons/tray-idle.png');
await shoot(BARS_W + 5 + WORDMARK_W, BAR_HEIGHTS, 'src-tauri/icons/tray-playing.png');

process.exit(0);
