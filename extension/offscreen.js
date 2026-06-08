// The audio host: a PlayerEngine running in Chrome's offscreen document.
// Music and polling live here, surviving popup open/close. Popups are just
// remote controls speaking chrome.runtime messages.

import { PlayerEngine } from '../src/playerEngine.js';
import { BACKEND_URL, BACKEND_KEY } from './backendConfig.js';

const engine = new PlayerEngine();
engine.configure({ backendUrl: BACKEND_URL, backendKey: BACKEND_KEY });
engine.startPolling();

const broadcast = (event, detail) => {
  chrome.runtime
    .sendMessage({ type: 'kexp:event', event, detail, state: engine.snapshot() })
    .catch(() => {
      // No listeners (popup closed) — the background still updates the badge.
    });
};

for (const event of [
  'playing-changed',
  'skip-changed',
  'track-changed',
  'like-changed',
  'playlist-changed',
  'count-changed',
  'show-changed',
  'error-changed',
]) {
  engine.addEventListener(event, (e) => broadcast(event, e.detail));
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'kexp:get-state') {
    sendResponse(engine.snapshot());
    return;
  }

  if (msg?.type === 'kexp:adopt-device-id') {
    // The content script found the website's device-id — adopt it so the
    // toolbar and the site share one playlist. Idempotent.
    engine.adoptDeviceId(msg.id);
    return;
  }

  if (msg?.type !== 'kexp:command') return;

  switch (msg.command) {
    case 'play':
      engine.play();
      break;
    case 'pause':
      engine.pause();
      break;
    case 'toggle':
      engine.toggle();
      break;
    case 'toggle-like':
      engine.toggleLike();
      break;
    case 'toggle-skip':
      engine.toggleSkip();
      break;
    case 'remove-like':
      engine.removeLike(msg.key);
      break;
    case 'set-note':
      engine.setNote(msg.key, msg.note);
      break;
    case 'reorder':
      engine.reorder(msg.keys);
      break;
  }
});
