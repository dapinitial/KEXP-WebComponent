// Service worker: owns the offscreen document lifecycle and the toolbar badge.
// The offscreen document hosts the PlayerEngine so KEXP keeps streaming after
// the popup closes.

async function ensureOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['AUDIO_PLAYBACK'],
    justification: 'Keep the KEXP live stream playing while the popup is closed.',
  });
}

chrome.runtime.onInstalled.addListener(ensureOffscreen);
chrome.runtime.onStartup.addListener(ensureOffscreen);

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === 'kexp:ensure-offscreen') {
    ensureOffscreen().then(() => sendResponse(true));
    return true; // async response
  }

  if (msg?.type === 'kexp:event') {
    const { state } = msg;
    const count = state.playlist?.length ?? 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#f91880' });

    const play = state.currentPlay;
    const title =
      state.isPlaying && play && (play.artist || play.song)
        ? `KEXP — ${play.artist ?? ''}${play.artist && play.song ? ': ' : ''}${play.song ?? ''}`
        : 'KEXP Player';
    chrome.action.setTitle({ title });
  }
});
