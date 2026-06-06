// The popup is a remote control: the full <audio-player> UI, driven by a
// proxy engine that forwards commands to the offscreen PlayerEngine and
// mirrors its broadcasts. Close the popup — the music keeps playing.

import './../src/audioPlayer.js';

const EMPTY_STATE = {
  isPlaying: false,
  currentPlay: null,
  playlist: [],
  isLiked: false,
  errorMessage: null,
  deviceId: 'remote',
};

class RemoteEngine extends EventTarget {
  #state;

  constructor(initialState) {
    super();
    this.#state = initialState ?? EMPTY_STATE;

    chrome.runtime.onMessage.addListener((msg) => {
      if (msg?.type !== 'kexp:event') return;
      this.#state = msg.state;
      this.dispatchEvent(new CustomEvent(msg.event, { detail: msg.detail }));
    });
  }

  #send(command, payload = {}) {
    chrome.runtime.sendMessage({ type: 'kexp:command', command, ...payload }).catch(() => {});
  }

  play() {
    this.#send('play');
  }

  pause() {
    this.#send('pause');
  }

  toggle() {
    this.#send('toggle');
  }

  toggleLike() {
    this.#send('toggle-like');
  }

  removeLike(key) {
    this.#send('remove-like', { key });
  }

  // The offscreen engine owns its own configuration and polling cadence.
  configure() {}
  startPolling() {}
  stopPolling() {}
  dispose() {}

  get isPlaying() {
    return this.#state.isPlaying;
  }

  get currentPlay() {
    return this.#state.currentPlay;
  }

  get isLiked() {
    return this.#state.isLiked;
  }

  get playlist() {
    return this.#state.playlist;
  }

  get errorMessage() {
    return this.#state.errorMessage;
  }

  get deviceId() {
    return this.#state.deviceId;
  }

  snapshot() {
    return this.#state;
  }
}

const getState = async (attempts = 5) => {
  for (let i = 0; i < attempts; i++) {
    try {
      const state = await chrome.runtime.sendMessage({ type: 'kexp:get-state' });
      if (state) return state;
    } catch {
      // Offscreen document still booting.
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return null;
};

(async () => {
  await chrome.runtime.sendMessage({ type: 'kexp:ensure-offscreen' }).catch(() => {});
  const state = await getState();
  document.querySelector('audio-player').engine = new RemoteEngine(state);
})();
