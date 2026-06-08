// Firefox flavor: no offscreen API, so the PlayerEngine lives in a background
// page (audio playback keeps it alive — the classic radio-extension pattern).
// Same message protocol as Chrome's offscreen host; the popup is identical.

import { PlayerEngine } from '../src/playerEngine.js';
import { BACKEND_URL, BACKEND_KEY } from './backendConfig.js';

const engine = new PlayerEngine();
engine.configure({ backendUrl: BACKEND_URL, backendKey: BACKEND_KEY });
engine.startPolling();

const updateBadge = (state) => {
  const count = state.playlist?.length ?? 0;
  chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#f91880' });

  const play = state.currentPlay;
  const title =
    state.isPlaying && play && (play.artist || play.song)
      ? `KEXP — ${play.artist ?? ''}${play.artist && play.song ? ': ' : ''}${play.song ?? ''}`
      : 'KEXP Player';
  chrome.action.setTitle({ title });
};

const broadcast = (event, detail) => {
  const state = engine.snapshot();
  updateBadge(state);
  chrome.runtime.sendMessage({ type: 'kexp:event', event, detail, state }).catch(() => {
    // No popups open — badge is already up to date.
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
  if (msg?.type === 'kexp:ensure-offscreen') {
    sendResponse(true); // nothing to ensure — the engine lives right here
    return;
  }

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

updateBadge(engine.snapshot());
