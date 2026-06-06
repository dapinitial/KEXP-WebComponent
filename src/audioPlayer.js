const KEXP_API_URL = 'https://api.kexp.org/v2/plays?ordering=-airdate&limit=1';

const DEFAULT_STREAM_URL = 'https://kexp.streamguys1.com/kexp160.aac';
const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_VOLUME = 0.5;
const MARQUEE_SPEED_PX_PER_S = 50;
const RESIZE_DEBOUNCE_MS = 100;

// One stylesheet, parsed once, shared across every <audio-player> instance.
const sheet = new CSSStyleSheet();
sheet.replaceSync(`
  :host {
    /* Public theming contract — override these from the outside. */
    --player-bg: #0a0a0a;
    --player-surface: #1c1c1e;
    --player-surface-hover: #2c2c2e;
    --player-accent: #ff5a1e;
    --player-text: #f5f5f5;
    --player-muted: #9a9a9f;
    --player-error: #ff8a80;
    --player-radius: 12px;

    --bar-size: 50px;
    --bar-speed: 1.4s;
    --bar-width: calc(var(--bar-size) / 2);
    --bar-color: var(--player-accent);

    display: block;
    height: 100%;
    /* Size containment: the host's width tracks the space it's given, never
       its content — otherwise long track names push the component wider than
       its container and the marquee can never detect overflow. */
    container-type: inline-size;
  }

  [hidden] {
    display: none !important;
  }

  .audioPlayer {
    color: var(--player-muted);
    font-family: system-ui, sans-serif;
    font-size: 13px;
    text-align: center;
    background: radial-gradient(circle at 50% 0%, #161616, var(--player-bg) 70%);
    height: 100%;
    place-content: center;

    & .playerContainer {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 12px;
      padding: 8px;
    }
  }

  .playPauseButton {
    cursor: pointer;
    padding: 30px 18px 20px;
    background: var(--player-surface);
    color: var(--player-text);
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: var(--player-radius);
    font: inherit;
    letter-spacing: 0.12em;
    transition: background 0.2s ease, transform 0.15s ease, border-color 0.2s ease;

    &:hover {
      background: var(--player-surface-hover);
      border-color: rgb(255 255 255 / 16%);
    }

    &:active {
      transform: scale(0.97);
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 3px;
    }
  }

  .errorMessage {
    color: var(--player-error);
    background: rgb(255 138 128 / 10%);
    border-radius: calc(var(--player-radius) / 2);
    padding: 4px 10px;
  }

  .kexpLogo {
    transform: scale(0.6);
    display: flex;
    align-items: center;
    position: relative;
  }

  .iconBars {
    clip-path: inset(0px -50px 20px 0px);
    display: flex;
    position: absolute;
    top: -32px;
    width: var(--bar-size, 10px);
    height: var(--bar-size, 10px);
    visibility: hidden;

    &.animating {
      visibility: visible;
    }

    & .bar {
      position: relative;
      bottom: 0;
      left: 4px;
      width: var(--bar-width, 2px);
      background-color: var(--bar-color, white);
      animation: up-down var(--bar-speed, 1s) infinite;
    }

    & .bar:nth-child(2) {
      left: 14px;
      animation-delay: calc(-1 * var(--bar-speed, 1s) / 3 * 2.1);
    }

    & .bar:nth-child(3) {
      left: 24px;
      animation-delay: calc(-1 * var(--bar-speed, 1s) / 3);
    }

    & .bar:nth-child(4) {
      left: 34px;
      animation-delay: calc(-1 * var(--bar-speed, 1s) / 2);
    }
  }

  .marqueeWrapper {
    overflow: hidden;
    position: relative;
    width: 100%;
    white-space: nowrap;
    display: flex;
    place-content: center;

    & .marquee {
      display: inline-block;
      will-change: transform;
    }
  }

  @keyframes up-down {
    0%,
    100% {
      transform: scaleY(1);
    }

    50% {
      transform: scaleY(0.5);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .iconBars .bar {
      animation: none;
    }

    .playPauseButton {
      transition: none;
    }
  }
`);

const template = document.createElement('template');
template.innerHTML = `
  <div class="audioPlayer" part="player">
    <audio id="audioPlayer" preload="none" hidden></audio>
    <div class="playerContainer">
      <button class="playPauseButton" part="button" type="button" aria-pressed="false" aria-label="Play KEXP live stream">
        <span class="kexpLogo" part="logo">
          <span class="iconBars" aria-hidden="true">
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
            <span class="bar"></span>
          </span>
          <svg width="90" height="40" viewBox="0 0 90 40" aria-hidden="true">
            <title>KEXP Logo</title>
            <g stroke="none" fill="currentColor" fill-rule="evenodd">
              <path d="M9.56,38 L9.56,24.96 L10.32,23.68 L15,38 L22.28,38 L16,20.24 L22,5.6 L15,5.6 L9.56,18.84 L9.56,5.6 L2.4,5.6 L2.4,38 L9.56,38 Z M41.22,38 L41.22,33.16 L33.74,33.16 L33.74,23.48 L39.38,23.48 L39.38,18.52 L33.74,18.52 L33.74,10.48 L41.14,10.48 L41.14,5.6 L26.58,5.6 L26.58,38 L41.22,38 Z M50.88,5.6 L54.44,14.36 L57.32,5.6 L63.28,5.6 L57.6,22.44 L63.92,38 L57.2,38 L53.24,28.32 L49.76,38 L43.84,38 L50.12,20.56 L44.12,5.6 L50.88,5.6 Z M78.94,5.6 C80.8866667,5.6 82.4866667,5.96666667 83.74,6.7 C84.9933333,7.43333333 85.9266667,8.5 86.54,9.9 C87.1533333,11.3 87.46,13 87.46,15 C87.46,17.5066667 87.0466667,19.42 86.22,20.74 C85.3933333,22.06 84.2733333,22.9733333 82.86,23.48 C81.4466667,23.9866667 79.86,24.24 78.1,24.24 L75.22,24.24 L75.22,38 L68.06,38 L68.06,5.6 L78.94,5.6 Z M77.58,10.64 L75.22,10.64 L75.22,19.24 L77.62,19.24 C78.5,19.24 79.1666667,19.08 79.62,18.76 C80.0733333,18.44 80.3733333,17.96 80.52,17.32 C80.6666667,16.68 80.74,15.8666667 80.74,14.88 C80.74,14.0533333 80.68,13.3266667 80.56,12.7 C80.44,12.0733333 80.1533333,11.5733333 79.7,11.2 C79.2466667,10.8266667 78.54,10.64 77.58,10.64 Z"></path>
            </g>
          </svg>
        </span>
        <span class="buttonText" part="button-text">PLAY</span>
      </button>
      <div class="marqueeWrapper" part="display">
        <div class="marquee" part="marquee" aria-live="polite">Loading now playing&hellip;</div>
      </div>
      <span class="errorMessage" part="error" role="alert" hidden></span>
    </div>
  </div>
`;

class AudioPlayer extends HTMLElement {
  static observedAttributes = ['stream-url', 'volume', 'poll-interval'];

  #audio;
  #button;
  #buttonText;
  #iconBars;
  #marquee;
  #marqueeWrapper;
  #errorEl;

  #currentPlay = null;
  #isPlaying = false;
  #isTransitioning = false;
  #audioInitialized = false;
  #pollTimer = null;
  #fetchController = null;
  #lifecycle = null;
  #resizeObserver = null;
  #marqueeAnimation = null;
  #marqueeDebounceTimer = null;
  #reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  constructor() {
    super();

    const shadow = this.attachShadow({ mode: 'open' });
    shadow.adoptedStyleSheets = [sheet];
    shadow.appendChild(template.content.cloneNode(true));

    this.#audio = shadow.querySelector('#audioPlayer');
    this.#button = shadow.querySelector('.playPauseButton');
    this.#buttonText = shadow.querySelector('.buttonText');
    this.#iconBars = shadow.querySelector('.iconBars');
    this.#marquee = shadow.querySelector('.marquee');
    this.#marqueeWrapper = shadow.querySelector('.marqueeWrapper');
    this.#errorEl = shadow.querySelector('.errorMessage');

    // Shadow-internal listeners share the element's lifetime — no cleanup needed.
    this.#button.addEventListener('click', () => this.toggle());
    this.#audio.addEventListener('play', () => this.#setPlaying(true));
    this.#audio.addEventListener('pause', () => this.#setPlaying(false));
    this.#audio.addEventListener('error', () => this.#showError('Stream unavailable.'));
  }

  connectedCallback() {
    // One controller tears down every external listener on disconnect.
    this.#lifecycle = new AbortController();
    const { signal } = this.#lifecycle;

    document.addEventListener('visibilitychange', this.#handleVisibilityChange, { signal });
    this.#reducedMotion.addEventListener('change', () => this.#updateMarquee(), { signal });

    this.#resizeObserver = new ResizeObserver(() => {
      clearTimeout(this.#marqueeDebounceTimer);
      this.#marqueeDebounceTimer = setTimeout(() => this.#updateMarquee(), RESIZE_DEBOUNCE_MS);
    });
    this.#resizeObserver.observe(this.#marqueeWrapper);

    this.#startPolling();
  }

  disconnectedCallback() {
    this.#lifecycle?.abort();
    this.#lifecycle = null;

    this.#stopPolling();
    this.#fetchController?.abort();
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    clearTimeout(this.#marqueeDebounceTimer);
    this.#marqueeAnimation?.cancel();
    this.#marqueeAnimation = null;

    // Release the stream connection; it will be re-established on next play.
    this.#audio.pause();
    this.#audio.removeAttribute('src');
    this.#audio.load();
    this.#audioInitialized = false;
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;

    if (name === 'volume' && this.#audioInitialized) {
      this.#audio.volume = this.volume;
    }

    if (name === 'poll-interval' && this.isConnected) {
      this.#startPolling();
    }
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get streamUrl() {
    return this.getAttribute('stream-url') || DEFAULT_STREAM_URL;
  }

  get volume() {
    const parsed = parseFloat(this.getAttribute('volume'));
    if (Number.isNaN(parsed)) return DEFAULT_VOLUME;
    return Math.min(1, Math.max(0, parsed));
  }

  get pollInterval() {
    const parsed = parseInt(this.getAttribute('poll-interval'), 10);
    if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_POLL_INTERVAL_MS;
    return parsed;
  }

  get currentPlay() {
    return this.#currentPlay;
  }

  play() {
    this.#initAudio();

    if (this.#isTransitioning || !this.#audio.paused) return;
    this.#isTransitioning = true;

    Promise.resolve(this.#audio.play())
      .then(() => this.#clearError())
      .catch(() => this.#showError('Unable to play audio.'))
      .finally(() => {
        this.#isTransitioning = false;
      });
  }

  pause() {
    if (this.#isTransitioning) return;
    this.#audio.pause();
  }

  toggle() {
    if (this.#isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  #initAudio() {
    if (this.#audioInitialized) return;

    this.#audio.src = this.streamUrl;
    this.#audio.volume = this.volume;
    this.#audio.load();
    this.#audioInitialized = true;
  }

  #setPlaying(playing) {
    if (this.#isPlaying === playing) return;
    this.#isPlaying = playing;
    this.#updatePlaybackUI();
    this.dispatchEvent(new CustomEvent('playing-changed', { detail: { isPlaying: playing } }));
  }

  #updatePlaybackUI() {
    this.#buttonText.textContent = this.#isPlaying ? 'PAUSE' : 'PLAY';
    this.#button.setAttribute('aria-pressed', String(this.#isPlaying));
    this.#button.setAttribute(
      'aria-label',
      this.#isPlaying ? 'Pause KEXP live stream' : 'Play KEXP live stream'
    );
    this.#iconBars.classList.toggle('animating', this.#isPlaying);
  }

  #handleVisibilityChange = () => {
    if (document.hidden) {
      this.#stopPolling();
    } else {
      this.#startPolling();
    }
  };

  #startPolling() {
    this.#stopPolling();

    const poll = async () => {
      await this.#fetchNowPlaying();
      this.#pollTimer = setTimeout(poll, this.pollInterval);
    };

    poll();
  }

  #stopPolling() {
    clearTimeout(this.#pollTimer);
    this.#pollTimer = null;
  }

  async #fetchNowPlaying() {
    this.#fetchController?.abort();
    const controller = new AbortController();
    this.#fetchController = controller;

    try {
      const response = await fetch(KEXP_API_URL, {
        credentials: 'omit',
        cache: 'no-store',
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`KEXP API responded with ${response.status}`);
      }

      const data = await response.json();
      const play = data.results?.[0];

      this.#clearError();

      if (play && play.airdate !== this.#currentPlay?.airdate) {
        this.#currentPlay = play;
        this.#updateNowPlaying();
        this.dispatchEvent(
          new CustomEvent('track-changed', {
            detail: { artist: play.artist, song: play.song, airdate: play.airdate },
          })
        );
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.#showError('Now playing info unavailable.');
      this.dispatchEvent(new CustomEvent('player-error', { detail: { message: err.message } }));
    }
  }

  #updateNowPlaying() {
    const artist = this.#currentPlay?.artist || 'Unknown Artist';
    const song = this.#currentPlay?.song || 'Unknown Song';
    this.#marquee.textContent = `Listening to: ${artist} - ${song} on 90.3 FM Seattle`;
    this.#updateMarquee();
  }

  // Web Animations API marquee: pixel-accurate, constant speed regardless of
  // text length, and no forced-reflow restart hacks.
  #updateMarquee() {
    this.#marqueeAnimation?.cancel();
    this.#marqueeAnimation = null;

    const textWidth = this.#marquee.scrollWidth;
    const containerWidth = this.#marqueeWrapper.clientWidth;

    if (textWidth <= containerWidth || this.#reducedMotion.matches) return;

    const distance = containerWidth + textWidth;
    this.#marqueeAnimation = this.#marquee.animate(
      [
        { transform: `translateX(${containerWidth}px)` },
        { transform: `translateX(${-textWidth}px)` },
      ],
      {
        duration: (distance / MARQUEE_SPEED_PX_PER_S) * 1000,
        iterations: Infinity,
        easing: 'linear',
      }
    );
  }

  #showError(message) {
    this.#errorEl.textContent = message;
    this.#errorEl.hidden = false;
  }

  #clearError() {
    if (this.#errorEl.hidden) return;
    this.#errorEl.textContent = '';
    this.#errorEl.hidden = true;
  }
}

if (!customElements.get('audio-player')) {
  customElements.define('audio-player', AudioPlayer);
}

export { AudioPlayer };
