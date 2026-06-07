// Ad-hoc E2E check for device-id adoption (chromium-only, not part of the
// suite). Loads dist-extension, intercepts davidpuerto.com/kexp with a fake
// page, seeds the site device-id, and asserts the extension engine adopts
// it. Performs no likes — backend traffic is read-only.
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { chromium } from '@playwright/test';

const EXT = join(process.cwd(), 'dist-extension');
const SEEDED = 'aaaabbbb-1111-4222-8333-444455556666';

const context = await chromium.launchPersistentContext(
  mkdtempSync(join(tmpdir(), 'kexp-ext-')),
  {
    channel: 'chromium',
    headless: true,
    args: [`--disable-extensions-except=${EXT}`, `--load-extension=${EXT}`],
  }
);

await context.route('**://davidpuerto.com/**', (route) =>
  route.fulfill({
    contentType: 'text/html',
    body: '<!DOCTYPE html><html><body>stand-in for the kexp page</body></html>',
  })
);

const page = await context.newPage();
await page.goto('https://davidpuerto.com/kexp/');
await page.evaluate((id) => localStorage.setItem('kexp-player:device-id', id), SEEDED);

let [sw] = context.serviceWorkers();
if (!sw) sw = await context.waitForEvent('serviceworker');

let snap = null;
for (let i = 0; i < 30; i++) {
  try {
    snap = await sw.evaluate(() => chrome.runtime.sendMessage({ type: 'kexp:get-state' }));
  } catch {
    // offscreen not up yet
  }
  if (snap?.deviceId === SEEDED) {
    console.log('ADOPTED ✓ extension deviceId =', snap.deviceId);
    await context.close();
    process.exit(0);
  }
  await new Promise((r) => setTimeout(r, 500));
}

console.error('FAILED: extension deviceId =', snap?.deviceId, '(expected', SEEDED + ')');
await context.close();
process.exit(1);
