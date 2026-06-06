import {
  PlayerEngine,
  isLikeablePlay,
  DEFAULT_STREAM_URL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_VOLUME,
} from './playerEngine.js';

const MARQUEE_SPEED_PX_PER_S = 50;
const RESIZE_DEBOUNCE_MS = 100;

const LIKE_BURST_COLORS = [
  '#f91880',
  '#ffd400',
  '#7856ff',
  '#00ba7c',
  '#ff7a00',
  '#1d9bf0',
  '#f4212e',
];

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
    --player-like: #f91880;
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

  /* ── The KEXP card flips over and expands into the playlist panel ── */
  .flipCard {
    position: relative;
    perspective: 1000px;
    transition: width 0.55s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.55s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .flipInner {
    position: relative;
    width: 100%;
    height: 100%;
    transform-style: preserve-3d;
    transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .flipCard.flipped .flipInner {
    transform: rotateY(180deg);
  }

  .cardFace {
    backface-visibility: hidden;
  }

  /* Front stays in flow so the collapsed card sizes to the play button. */
  .cardFront {
    position: relative;
    height: 100%;
    display: grid;
    place-items: center;
  }

  .cardBack {
    position: absolute;
    inset: 0;
    transform: rotateY(180deg);
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 14px 44px;
    background: var(--player-surface);
    border: 1px solid rgb(255 255 255 / 8%);
    border-radius: var(--player-radius);
    overflow-y: auto;
  }

  /* The like-counter chip doubles as the playlist door. */
  .playlistChip {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    background: var(--player-surface);
    border: 1px solid rgb(255 255 255 / 10%);
    border-radius: 999px;
    color: var(--player-text);
    font: inherit;
    cursor: pointer;
    transition: background 0.2s ease, opacity 0.2s ease;

    & .chipHeart {
      color: var(--player-like);
    }

    &:hover {
      background: var(--player-surface-hover);
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 2px;
    }

    &.empty {
      opacity: 0.55;
    }
  }

  .flipBackButton {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--player-muted);
    font-size: 14px;
    line-height: 1;
    transition: color 0.2s ease, background 0.2s ease;

    &:hover {
      color: var(--player-text);
      background: rgb(255 255 255 / 10%);
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 2px;
    }
  }

  .playlistTitle {
    color: var(--player-text);
    font-size: 14px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .playlist {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;

    & li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 6px 10px;
      background: rgb(255 255 255 / 4%);
      border-radius: calc(var(--player-radius) / 2);
      text-align: left;
    }

    & .trackTitle {
      color: var(--player-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    & .rowConfirm {
      display: flex;
      align-items: center;
      gap: 6px;
      color: var(--player-error);
      white-space: nowrap;
    }

    & button {
      background: transparent;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      color: var(--player-muted);
      font: inherit;
      padding: 2px 6px;

      &:hover {
        color: var(--player-text);
        background: rgb(255 255 255 / 8%);
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 1px;
      }
    }

    & .confirmYes {
      color: var(--player-error);
      font-weight: 600;
    }
  }

  .playlistEmpty {
    margin: 0;
  }

  .playlistEmpty[hidden] {
    display: none;
  }

  .emailForm {
    display: flex;
    gap: 8px;
    margin-top: auto;

    & .emailInput {
      flex: 1;
      min-width: 0;
      padding: 8px 10px;
      background: rgb(255 255 255 / 6%);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: calc(var(--player-radius) / 2);
      color: var(--player-text);
      font: inherit;

      &::placeholder {
        color: var(--player-muted);
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 1px;
      }
    }

    & .emailButton {
      padding: 8px 12px;
      background: var(--player-surface);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: calc(var(--player-radius) / 2);
      color: var(--player-text);
      font: inherit;
      cursor: pointer;
      white-space: nowrap;

      &:hover {
        background: var(--player-surface-hover);
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 2px;
      }
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

  /* The heart lives visually inside the play button but is a SIBLING in the
     DOM — nested buttons are invalid HTML and break keyboard/AT semantics.
     It anchors to the card front, which hugs the play button when collapsed. */
  .likeButton {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    place-items: center;
    padding: 4px;
    background: transparent;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    color: var(--player-muted);
    transition: color 0.2s ease, transform 0.15s ease;

    & svg {
      display: block;
      fill: none;
      stroke: currentColor;
      stroke-width: 2;
    }

    &:hover:not(:disabled) {
      color: var(--player-like);
    }

    &:active:not(:disabled) {
      transform: scale(0.9);
    }

    &:focus-visible {
      outline: 2px solid var(--player-like);
      outline-offset: 2px;
    }

    &:disabled {
      opacity: 0.4;
      cursor: default;
    }

    &.liked {
      color: var(--player-like);

      & svg {
        fill: currentColor;
      }
    }

    & .likeCount {
      font-size: 9px;
      line-height: 1;
      letter-spacing: 0;
    }
  }

  /* Positioning anchor so the burst is centered on the heart itself. */
  .heartWrap {
    position: relative;
    display: grid;
    place-items: center;
  }

  .likeParticle {
    position: absolute;
    top: 50%;
    left: 50%;
    /* The translate property composes with animated transforms, so the
       centering survives the flight animation (and border widths). */
    translate: -50% -50%;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    pointer-events: none;
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

    .flipCard,
    .flipInner {
      transition: none;
    }
  }
`);

const template = document.createElement('template');
template.innerHTML = `
  <div class="audioPlayer" part="player">
    <audio id="audioPlayer" preload="none" hidden></audio>
    <div class="playerContainer">
      <div class="flipCard">
      <div class="flipInner">
      <section class="cardFace cardFront" part="front">
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
      <button class="likeButton" part="like" type="button" aria-pressed="false" aria-label="Like this song" disabled>
        <span class="heartWrap">
          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
          </svg>
        </span>
        <span class="likeCount" part="like-count" hidden>0</span>
      </button>
      </section>
      <section class="cardFace cardBack" part="back" inert>
        <h2 class="playlistTitle">Liked songs</h2>
        <ul class="playlist" part="playlist"></ul>
        <p class="playlistEmpty">Nothing liked yet &mdash; smash the &hearts; while a song plays.</p>
        <form class="emailForm" novalidate>
          <input class="emailInput" type="email" name="email" placeholder="you@example.com" aria-label="Email address" required>
          <button class="emailButton" type="submit">Email me this list</button>
        </form>
        <a class="emailLink" hidden aria-hidden="true"></a>
        <button class="flipBackButton" part="menu-close" type="button" aria-label="Close playlist">&#10005;</button>
      </section>
      </div>
      </div>
      <div class="marqueeWrapper" part="display">
        <div class="marquee" part="marquee" aria-live="polite">Loading now playing&hellip;</div>
      </div>
      <button class="playlistChip" part="menu" type="button" aria-label="Show liked songs">
        <span class="chipHeart" aria-hidden="true">&hearts;</span>
        <span class="chipCount">0</span>
      </button>
      <span class="errorMessage" part="error" role="alert" hidden></span>
    </div>
  </div>
`;

class AudioPlayer extends HTMLElement {
  static observedAttributes = [
    'stream-url',
    'volume',
    'poll-interval',
    'backend-url',
    'backend-key',
  ];

  #engine;
  #ownsEngine = true;
  #engineAbort = null;

  #button;
  #buttonText;
  #iconBars;
  #marquee;
  #marqueeWrapper;
  #errorEl;
  #likeButton;
  #heartWrap;
  #flipCard;
  #cardFront;
  #cardBack;
  #playlistChip;
  #chipCount;
  #flipBackButton;
  #playlistEl;
  #playlistEmpty;
  #emailForm;
  #emailInput;
  #emailLink;
  #likeCountEl;
  #collapsedSize = null;

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

    this.#button = shadow.querySelector('.playPauseButton');
    this.#buttonText = shadow.querySelector('.buttonText');
    this.#iconBars = shadow.querySelector('.iconBars');
    this.#marquee = shadow.querySelector('.marquee');
    this.#marqueeWrapper = shadow.querySelector('.marqueeWrapper');
    this.#errorEl = shadow.querySelector('.errorMessage');
    this.#likeButton = shadow.querySelector('.likeButton');
    this.#heartWrap = shadow.querySelector('.heartWrap');
    this.#flipCard = shadow.querySelector('.flipCard');
    this.#cardFront = shadow.querySelector('.cardFront');
    this.#cardBack = shadow.querySelector('.cardBack');
    this.#playlistChip = shadow.querySelector('.playlistChip');
    this.#chipCount = shadow.querySelector('.chipCount');
    this.#flipBackButton = shadow.querySelector('.flipBackButton');
    this.#playlistEl = shadow.querySelector('.playlist');
    this.#playlistEmpty = shadow.querySelector('.playlistEmpty');
    this.#emailForm = shadow.querySelector('.emailForm');
    this.#emailInput = shadow.querySelector('.emailInput');
    this.#emailLink = shadow.querySelector('.emailLink');
    this.#likeCountEl = shadow.querySelector('.likeCount');

    // Default engine drives the audio element in our shadow DOM. Hosts like
    // the browser extension popup inject a remote engine instead.
    this.#engine = new PlayerEngine({ audio: shadow.querySelector('#audioPlayer') });
    this.#ownsEngine = true;
    this.#attachEngine();

    // Shadow-internal listeners share the element's lifetime — no cleanup needed.
    this.#button.addEventListener('click', () => this.toggle());
    this.#likeButton.addEventListener('click', (event) => {
      // The heart is a sibling overlay, so this can't reach the play button —
      // stopPropagation is belt-and-suspenders.
      event.stopPropagation();
      this.toggleLike();
    });
    this.#playlistChip.addEventListener('click', () => this.#setFlipped(true));
    this.#flipBackButton.addEventListener('click', () => this.#setFlipped(false));
    this.#emailForm.addEventListener('submit', (event) => this.#emailPlaylist(event));

    this.#syncFromEngine();
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

    this.#engine.configure(this.#attributeConfig());
    this.#engine.startPolling();
  }

  disconnectedCallback() {
    this.#lifecycle?.abort();
    this.#lifecycle = null;

    this.#resizeObserver?.disconnect();
    this.#resizeObserver = null;
    clearTimeout(this.#marqueeDebounceTimer);
    this.#marqueeAnimation?.cancel();
    this.#marqueeAnimation = null;

    // A remote engine (extension offscreen document) keeps playing on its own;
    // only an engine we own should be torn down with the element.
    if (this.#ownsEngine) {
      this.#engine.dispose();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue === newValue) return;
    this.#engine.configure(this.#attributeConfig());
  }

  get engine() {
    return this.#engine;
  }

  set engine(next) {
    if (!next || next === this.#engine) return;

    this.#detachEngine();
    if (this.#ownsEngine) {
      this.#engine.dispose();
    }

    this.#engine = next;
    this.#ownsEngine = false;
    this.#attachEngine();
    this.#syncFromEngine();
  }

  get isPlaying() {
    return this.#engine.isPlaying;
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
    return this.#engine.currentPlay;
  }

  get isLiked() {
    return this.#engine.isLiked;
  }

  get playlist() {
    return this.#engine.playlist;
  }

  get deviceId() {
    return this.#engine.deviceId;
  }

  play() {
    this.#engine.play();
  }

  pause() {
    this.#engine.pause();
  }

  toggle() {
    this.#engine.toggle();
  }

  toggleLike() {
    this.#engine.toggleLike();
  }

  #attributeConfig() {
    return {
      streamUrl: this.getAttribute('stream-url') ?? undefined,
      volume: this.getAttribute('volume') ?? undefined,
      pollInterval: this.getAttribute('poll-interval') ?? undefined,
      backendUrl: this.getAttribute('backend-url') ?? undefined,
      backendKey: this.getAttribute('backend-key') ?? undefined,
    };
  }

  #attachEngine() {
    this.#engineAbort = new AbortController();
    const { signal } = this.#engineAbort;
    const engine = this.#engine;

    engine.addEventListener(
      'playing-changed',
      (e) => {
        this.#updatePlaybackUI();
        this.dispatchEvent(new CustomEvent('playing-changed', { detail: e.detail }));
      },
      { signal }
    );

    engine.addEventListener(
      'track-changed',
      (e) => {
        const { play } = e.detail;
        this.#updateNowPlaying(play);
        this.dispatchEvent(
          new CustomEvent('track-changed', {
            detail: { artist: play.artist, song: play.song, airdate: play.airdate },
          })
        );
      },
      { signal }
    );

    engine.addEventListener(
      'like-changed',
      (e) => {
        if (e.detail.liked) {
          this.#burstHearts();
        }
        this.#updateLikeUI();
        if (this.#flipCard.classList.contains('flipped')) {
          this.#renderPlaylist();
        }
        this.dispatchEvent(new CustomEvent('like-changed', { detail: e.detail }));
      },
      { signal }
    );

    engine.addEventListener(
      'count-changed',
      () => this.#updateLikeCount(),
      { signal }
    );

    engine.addEventListener(
      'playlist-changed',
      (e) => {
        this.#updateLikeUI();
        if (this.#flipCard.classList.contains('flipped')) {
          this.#renderPlaylist();
        }
        this.dispatchEvent(new CustomEvent('playlist-changed', { detail: e.detail }));
      },
      { signal }
    );

    engine.addEventListener(
      'error-changed',
      (e) => {
        const { message } = e.detail;
        if (message) {
          this.#showError(message);
          this.dispatchEvent(new CustomEvent('player-error', { detail: { message } }));
        } else {
          this.#clearError();
        }
      },
      { signal }
    );
  }

  #detachEngine() {
    this.#engineAbort?.abort();
    this.#engineAbort = null;
  }

  #syncFromEngine() {
    this.#updatePlaybackUI();
    this.#updateLikeUI();

    const play = this.#engine.currentPlay;
    if (play) {
      this.#updateNowPlaying(play);
    }

    const message = this.#engine.errorMessage;
    if (message) {
      this.#showError(message);
    } else {
      this.#clearError();
    }

    if (this.#flipCard.classList.contains('flipped')) {
      this.#renderPlaylist();
    }
  }

  #updatePlaybackUI() {
    const playing = this.#engine.isPlaying;
    this.#buttonText.textContent = playing ? 'PAUSE' : 'PLAY';
    this.#button.setAttribute('aria-pressed', String(playing));
    this.#button.setAttribute(
      'aria-label',
      playing ? 'Pause KEXP live stream' : 'Play KEXP live stream'
    );
    this.#iconBars.classList.toggle('animating', playing);
  }

  #updateNowPlaying(play) {
    if (isLikeablePlay(play)) {
      const artist = play.artist || 'Unknown Artist';
      const song = play.song || 'Unknown Song';
      this.#marquee.textContent = `Listening to: ${artist} - ${song} on 90.3 FM Seattle`;
    } else {
      this.#marquee.textContent = 'Air break — KEXP 90.3 FM Seattle';
    }

    this.#updateMarquee();
    this.#updateLikeUI();
  }

  #updateLikeUI() {
    const liked = this.#engine.isLiked;
    this.#likeButton.disabled = !isLikeablePlay(this.#engine.currentPlay);
    this.#likeButton.classList.toggle('liked', liked);
    this.#likeButton.setAttribute('aria-pressed', String(liked));
    this.#likeButton.setAttribute('aria-label', liked ? 'Unlike this song' : 'Like this song');

    const size = this.#engine.playlist.length;
    this.#chipCount.textContent = String(size);
    this.#playlistChip.classList.toggle('empty', size === 0);
    this.#playlistChip.setAttribute('aria-label', `Show liked songs (${size})`);

    this.#updateLikeCount();
  }

  // Global like count for the current song, shown under the heart.
  #updateLikeCount() {
    const count = this.#engine.globalLikes ?? 0;
    this.#likeCountEl.textContent = count > 999 ? '999+' : String(count);
    this.#likeCountEl.hidden = count === 0;
  }

  #handleVisibilityChange = () => {
    // Only pause polling for an engine tied to this document — a remote
    // engine polls in its own context regardless of our visibility.
    if (!this.#ownsEngine) return;

    if (document.hidden) {
      this.#engine.stopPolling();
    } else {
      this.#engine.startPolling();
    }
  };

  #setFlipped(flipped) {
    const card = this.#flipCard;
    // inert fully removes the hidden face from tab order and AT.
    this.#cardFront.inert = flipped;
    this.#cardBack.inert = !flipped;

    if (flipped) {
      const rect = card.getBoundingClientRect();
      this.#collapsedSize = { width: rect.width, height: rect.height };

      // Expand toward iPhone 13 dimensions (390×844), clamped to the host.
      const host = this.getBoundingClientRect();
      const targetW = Math.max(rect.width, Math.min(390, host.width - 24));
      const targetH = Math.max(rect.height, Math.min(844, host.height - 24));

      card.style.width = `${rect.width}px`;
      card.style.height = `${rect.height}px`;
      void card.offsetWidth; // commit the starting size so the growth animates
      card.style.width = `${targetW}px`;
      card.style.height = `${targetH}px`;
      card.classList.add('flipped');

      this.#renderPlaylist();
      this.#flipBackButton.focus();
    } else {
      if (this.#collapsedSize) {
        card.style.width = `${this.#collapsedSize.width}px`;
        card.style.height = `${this.#collapsedSize.height}px`;
      }
      card.classList.remove('flipped');
      this.#playlistChip.focus();

      // Once the shrink finishes, let the card size itself naturally again.
      const clear = () => {
        card.style.width = '';
        card.style.height = '';
      };
      if (this.#reducedMotion.matches) {
        clear();
      } else {
        card.addEventListener('transitionend', clear, { once: true });
      }
    }
  }

  #renderPlaylist() {
    this.#playlistEl.textContent = '';
    const entries = this.#engine.playlist;
    this.#playlistEmpty.hidden = entries.length > 0;

    for (const track of entries) {
      const li = document.createElement('li');

      const title = document.createElement('span');
      title.className = 'trackTitle';
      title.textContent = `${track.artist || 'Unknown Artist'} — ${track.song || 'Unknown Song'}`;

      const removeButton = document.createElement('button');
      removeButton.className = 'removeButton';
      removeButton.type = 'button';
      removeButton.textContent = '✕';
      removeButton.setAttribute('aria-label', `Remove ${track.song} from playlist`);

      const confirmBox = document.createElement('span');
      confirmBox.className = 'rowConfirm';
      confirmBox.hidden = true;

      const confirmLabel = document.createElement('span');
      confirmLabel.textContent = 'Remove?';

      const confirmYes = document.createElement('button');
      confirmYes.className = 'confirmYes';
      confirmYes.type = 'button';
      confirmYes.textContent = 'Yes';

      const confirmNo = document.createElement('button');
      confirmNo.className = 'confirmNo';
      confirmNo.type = 'button';
      confirmNo.textContent = 'Cancel';

      removeButton.addEventListener('click', () => {
        removeButton.hidden = true;
        confirmBox.hidden = false;
        confirmYes.focus();
      });
      confirmNo.addEventListener('click', () => {
        confirmBox.hidden = true;
        removeButton.hidden = false;
        removeButton.focus();
      });
      confirmYes.addEventListener('click', () => this.#engine.removeLike(track.key));

      confirmBox.append(confirmLabel, confirmYes, confirmNo);
      li.append(title, removeButton, confirmBox);
      this.#playlistEl.appendChild(li);
    }
  }

  #emailPlaylist(event) {
    event.preventDefault();

    if (!this.#emailInput.reportValidity()) return;

    const lines = this.#engine.playlist.map((t) => `${t.artist} — ${t.song}`);
    const subject = 'My KEXP liked songs';
    const body = `${lines.join('\n')}\n\nHeard on KEXP 90.3 FM Seattle — kexp.org`;

    this.#emailLink.href =
      `mailto:${encodeURIComponent(this.#emailInput.value)}` +
      `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    this.#emailLink.click();
  }

  // Twitter-style burst: the heart double-flips on the X axis with motion
  // blur while a ring expands and confetti particles fly outward from the
  // heart's center. Pure WAAPI, self-cleaning.
  #burstHearts() {
    if (this.#reducedMotion.matches) return;

    const heart = this.#likeButton.querySelector('svg');
    heart.animate(
      [
        {
          transform: 'perspective(160px) rotateX(0deg) scale(0.4)',
          filter: 'blur(0px)',
        },
        {
          transform: 'perspective(160px) rotateX(360deg) scale(1.25)',
          filter: 'blur(2px)',
          offset: 0.45,
        },
        {
          transform: 'perspective(160px) rotateX(720deg) scale(1.35)',
          filter: 'blur(0.5px)',
          offset: 0.75,
        },
        {
          transform: 'perspective(160px) rotateX(720deg) scale(1)',
          filter: 'blur(0px)',
        },
      ],
      { duration: 700, easing: 'cubic-bezier(0.17, 0.89, 0.32, 1.28)' }
    );

    const ring = document.createElement('span');
    ring.className = 'likeParticle';
    ring.style.cssText =
      'width:10px;height:10px;background:transparent;' +
      'border:2px solid var(--player-like);';
    this.#heartWrap.appendChild(ring);
    ring
      .animate(
        [
          { transform: 'scale(0.3)', opacity: 1 },
          { transform: 'scale(3.5)', opacity: 0 },
        ],
        { duration: 500, easing: 'ease-out' }
      )
      .finished.then(() => ring.remove(), () => ring.remove());

    LIKE_BURST_COLORS.forEach((color, i, all) => {
      const particle = document.createElement('span');
      particle.className = 'likeParticle';
      particle.style.background = color;
      this.#heartWrap.appendChild(particle);

      const angle = (i / all.length) * 2 * Math.PI - Math.PI / 2;
      const distance = 22 + (i % 2) * 8;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;

      particle
        .animate(
          [
            { transform: 'translate(0, 0) scale(1)', opacity: 1 },
            { transform: `translate(${x}px, ${y}px) scale(0.2)`, opacity: 0 },
          ],
          { duration: 600, easing: 'cubic-bezier(0.16, 0.8, 0.4, 1)' }
        )
        .finished.then(() => particle.remove(), () => particle.remove());
    });
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
