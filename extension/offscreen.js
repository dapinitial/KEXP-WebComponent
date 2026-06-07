// The audio host: a PlayerEngine running in Chrome's offscreen document.
// Music and polling live here, surviving popup open/close. Popups are just
// remote controls speaking chrome.runtime messages.

import { PlayerEngine } from '../src/playerEngine.js';

const engine = new PlayerEngine();
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
