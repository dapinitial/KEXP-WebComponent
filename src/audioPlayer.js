import {
  PlayerEngine,
  isLikeablePlay,
  DEFAULT_STREAM_URL,
  DEFAULT_POLL_INTERVAL_MS,
  DEFAULT_VOLUME,
} from './playerEngine.js';
import { artistSummary, youtubeSearchUrl, spotifySearchUrl } from './wikipedia.js';
import { setArtwork } from './albumArt.js';
import { exportToSpotify, hasPendingExport, delegatedExport } from './spotify.js';
import { recordingCredits } from './musicbrainz.js';
import { artistEnrichment, formatListeners } from './enrich.js';

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
      flex-direction: column;
      gap: 4px;
      padding: 6px 10px;
      background: rgb(255 255 255 / 4%);
      border-radius: calc(var(--player-radius) / 2);
      text-align: left;
    }

    & .rowMain {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    & .noteButton.hasNote {
      color: var(--player-accent);
    }

    & .noteText {
      margin: 0;
      font-size: 11px;
      font-style: italic;
      color: var(--player-muted);
      cursor: pointer;

      &:hover {
        color: var(--player-text);
      }
    }

    & .noteInput {
      width: 100%;
      box-sizing: border-box;
      padding: 5px 8px;
      background: rgb(255 255 255 / 6%);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: calc(var(--player-radius) / 2);
      color: var(--player-text);
      font: inherit;
      font-size: 11px;

      &::placeholder {
        color: var(--player-muted);
        font-style: italic;
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 1px;
      }
    }

    & .dragHandle {
      flex-shrink: 0;
      padding: 2px 4px;
      background: none;
      border: none;
      border-radius: 4px;
      color: var(--player-muted);
      font-size: 12px;
      line-height: 1;
      cursor: grab;
      touch-action: none;

      &:hover {
        color: var(--player-text);
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 1px;
      }
    }

    & li.dragging {
      opacity: 0.92;
      box-shadow: 0 6px 18px rgb(0 0 0 / 50%);
      position: relative;
      z-index: 1;

      & .dragHandle {
        cursor: grabbing;
      }
    }

    & .albumArt {
      flex-shrink: 0;
      width: 28px;
      height: 28px;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: rgb(255 255 255 / 8%);
      color: var(--player-muted);
      font-size: 13px;
      display: grid;
      place-items: center;
      cursor: pointer;
      overflow: hidden;

      & img {
        width: 100%;
        height: 100%;
        object-fit: cover;
        display: block;
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 1px;
      }
    }

    & .trackTitle {
      flex: 1;
      min-width: 0;
      color: var(--player-text);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;

      &.scrolling {
        text-overflow: clip;
      }

      & .trackScroll {
        display: inline-block;
        white-space: nowrap;
      }
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

  .artistLink {
    background: none;
    border: none;
    padding: 0;
    margin: 0;
    font: inherit;
    color: var(--player-text);
    cursor: pointer;
    text-decoration: underline dotted rgb(255 255 255 / 35%);
    text-underline-offset: 3px;

    &:hover,
    &:focus-visible {
      color: var(--player-accent);
      text-decoration-color: currentColor;
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 1px;
      border-radius: 2px;
    }
  }

  .youtubeLink,
  .spotifyLink {
    display: inline-grid;
    place-items: center;
    width: 22px;
    height: 22px;
    border-radius: 4px;
    color: var(--player-muted);
    text-decoration: none;
    font-size: 10px;
    line-height: 1;

    &:hover {
      color: var(--player-text);
      background: rgb(255 255 255 / 8%);
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 1px;
    }
  }

  /* Wikipedia hover card — one shared element, repositioned per row. */
  .hoverCard {
    position: absolute;
    z-index: 2;
    left: 14px;
    right: 14px;
    display: flex;
    gap: 10px;
    padding: 10px;
    background: #232327;
    border: 1px solid rgb(255 255 255 / 14%);
    border-radius: calc(var(--player-radius) / 1.5);
    box-shadow: 0 8px 28px rgb(0 0 0 / 55%);
    text-align: left;

    & .hoverCardImage {
      width: 56px;
      height: 56px;
      object-fit: cover;
      border-radius: 8px;
      flex-shrink: 0;
    }

    & .hoverCardBody {
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    & .hoverCardTitle {
      color: var(--player-text);
      font-size: 13px;
    }

    & .hoverCardBadges {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      gap: 4px;

      & .badge {
        flex: 0 0 auto;
        white-space: nowrap;
        font-size: 9px;
        letter-spacing: 0.08em;
        padding: 2px 6px;
        border-radius: 999px;
        background: rgb(255 90 30 / 18%);
        color: var(--player-accent);
      }
    }

    & .hoverCardMeta {
      margin: 0;
      font-size: 11px;
      color: var(--player-muted);
    }

    & .hoverCardExtract {
      margin: 0;
      font-size: 12px;
      line-height: 1.45;
      white-space: pre-line;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    & .hoverCardLink {
      color: var(--player-accent);
      font-size: 11px;
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
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

  /* "Add this list to Spotify" — the export zone under the email form. */
  .spotifyExport {
    margin-top: 10px;

    & .spotifyExportButton {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      justify-content: center;
      padding: 8px 12px;
      background: var(--player-surface);
      border: 1px solid rgb(255 255 255 / 12%);
      border-radius: calc(var(--player-radius) / 2);
      color: var(--player-text);
      font: inherit;
      cursor: pointer;

      & svg {
        fill: currentColor;
      }

      &:hover:not(:disabled) {
        background: var(--player-surface-hover);
      }

      &:focus-visible {
        outline: 2px solid var(--player-accent);
        outline-offset: 2px;
      }

      &:disabled {
        opacity: 0.5;
        cursor: default;
      }
    }

    & .spotifyExportStatus {
      margin: 8px 0 0;
      font-size: 12px;
      color: var(--player-muted);

      & a {
        color: var(--player-accent);
      }
    }

    & .spotifyExportCaveat {
      margin: 6px 0 0;
      font-size: 11px;
      color: var(--player-muted);
      opacity: 0.8;

      & a {
        color: inherit;
        text-decoration: underline;
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

  /* The action rail lives visually inside the play button but is a SIBLING
     in the DOM — nested buttons are invalid HTML and break keyboard/AT
     semantics. It anchors to the card front, which hugs the play button when
     collapsed. Heart on top (the star of the show), song links below it —
     the whole rail hides during airbreaks (nothing to like or link to). */
  .actionRail {
    position: absolute;
    top: 6px;
    right: 6px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 7px;
  }

  .railLink {
    display: inline-grid;
    place-items: center;
    width: 18px;
    height: 18px;
    padding: 0;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--player-muted);
    cursor: pointer;
    opacity: 0.55;
    transition: color 0.2s ease, opacity 0.2s ease;

    & svg {
      display: block;
      fill: currentColor;
    }

    &:hover {
      color: var(--player-text);
      opacity: 1;
    }

    &:focus-visible {
      outline: 2px solid var(--player-accent);
      outline-offset: 1px;
      opacity: 1;
    }

    &:disabled {
      opacity: 0.25;
      cursor: default;
    }

    &.skipping {
      color: var(--player-accent);
      opacity: 1;
      animation: skip-pulse 1s ease-in-out infinite;
    }
  }

  @keyframes skip-pulse {
    50% {
      opacity: 0.4;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .railLink.skipping {
      animation: none;
    }
  }

  .likeButton {
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

  .nowPlayingRow {
    display: flex;
    align-items: center;
    gap: 10px;
    width: min(440px, 100%);
    padding: 0 8px;
    box-sizing: border-box;
  }

  .nowArt {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    object-fit: cover;
    border-radius: 8px;
    border: 1px solid rgb(255 255 255 / 10%);
  }

  .nowPlayingText {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .showLine {
    margin: 0;
    font-size: 11px;
    color: var(--player-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
      <div class="actionRail" part="actions" hidden>
        <button class="likeButton" part="like" type="button" aria-pressed="false" aria-label="Like this song" disabled>
          <span class="heartWrap">
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"></path>
            </svg>
          </span>
          <span class="likeCount" part="like-count" hidden>0</span>
        </button>
        <a class="railLink youtubeRailLink" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path>
          </svg>
        </a>
        <a class="railLink spotifyRailLink" target="_blank" rel="noopener noreferrer">
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"></path>
          </svg>
        </a>
        <button class="railLink skipButton" part="skip" type="button" aria-pressed="false" aria-label="Skip this song — mute until the next one" disabled>
          <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 18l8.5-6L6 6v12zM16 6h2v12h-2z"></path>
          </svg>
        </button>
      </div>
      </section>
      <section class="cardFace cardBack" part="back" inert>
        <h2 class="playlistTitle">Liked songs</h2>
        <ul class="playlist" part="playlist"></ul>
        <p class="playlistEmpty">Nothing liked yet &mdash; smash the &hearts; while a song plays.</p>
        <form class="emailForm" novalidate>
          <input class="emailInput" type="email" name="email" placeholder="you@example.com" aria-label="Email address" required>
          <button class="emailButton" type="submit">Email me this list</button>
        </form>
        <div class="spotifyExport" hidden>
          <button class="spotifyExportButton" type="button">
            <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"></path>
            </svg>
            Add this list to Spotify
          </button>
          <p class="spotifyExportStatus" role="status" hidden></p>
          <p class="spotifyExportCaveat">Uses your Spotify account — songs you export become part of your
            Spotify history. <a href="https://davidpuerto.com/kexp/privacy/" target="_blank" rel="noopener">Details</a></p>
        </div>
        <a class="emailLink" hidden aria-hidden="true"></a>
        <button class="flipBackButton" part="menu-close" type="button" aria-label="Close playlist">&#10005;</button>
        <div class="hoverCard" part="hover-card" role="tooltip" hidden>
          <img class="hoverCardImage" alt="" hidden>
          <div class="hoverCardBody">
            <strong class="hoverCardTitle"></strong>
            <span class="hoverCardBadges" hidden></span>
            <p class="hoverCardMeta" hidden></p>
            <p class="hoverCardExtract" hidden></p>
            <a class="hoverCardLink" target="_blank" rel="noopener noreferrer" hidden></a>
          </div>
        </div>
      </section>
      </div>
      </div>
      <div class="nowPlayingRow">
        <img class="nowArt" part="now-art" alt="" hidden>
        <div class="nowPlayingText">
          <div class="marqueeWrapper" part="display">
            <div class="marquee" part="marquee" aria-live="polite">Loading now playing&hellip;</div>
          </div>
          <p class="showLine" part="show" hidden></p>
        </div>
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
    'spotify-client-id',
    'spotify-export-url',
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
  #actionRail;
  #youtubeRailLink;
  #spotifyRailLink;
  #skipButton;
  #spotifyExport;
  #spotifyExportButton;
  #spotifyExportStatus;
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
  #nowArt;
  #showLine;
  #hoverCard;
  #hoverCardArtist = null;
  #hoverCardHideTimer = null;
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
    this.#actionRail = shadow.querySelector('.actionRail');
    this.#youtubeRailLink = shadow.querySelector('.youtubeRailLink');
    this.#spotifyRailLink = shadow.querySelector('.spotifyRailLink');
    this.#skipButton = shadow.querySelector('.skipButton');
    this.#skipButton.addEventListener('click', () => this.#engine.toggleSkip?.());
    this.#spotifyExport = shadow.querySelector('.spotifyExport');
    this.#spotifyExportButton = shadow.querySelector('.spotifyExportButton');
    this.#spotifyExportStatus = shadow.querySelector('.spotifyExportStatus');
    this.#spotifyExportButton.addEventListener('click', () => this.#runSpotifyExport());
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
    this.#nowArt = shadow.querySelector('.nowArt');
    this.#showLine = shadow.querySelector('.showLine');
    this.#hoverCard = shadow.querySelector('.hoverCard');

    // Keep the card open while the pointer is over it; close when it leaves.
    this.#hoverCard.addEventListener('pointerenter', () =>
      clearTimeout(this.#hoverCardHideTimer)
    );
    this.#hoverCard.addEventListener('pointerleave', () => this.#scheduleHideArtistCard());
    this.#cardBack.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') this.#hideArtistCard();
    });

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
    this.#playlistChip.addEventListener('click', () =>
      this.#setFlipped(!this.#flipCard.classList.contains('flipped'))
    );
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

    // Returning from Spotify's consent screen: finish the export the user
    // started (their click survives the round-trip via sessionStorage), and
    // flip to the playlist so the progress is visible.
    if (this.getAttribute('spotify-client-id')) {
      if (hasPendingExport()) {
        this.#setFlipped(true);
        this.#runSpotifyExport();
      } else {
        const delegated = delegatedExport();
        if (delegated) this.#startDelegatedExport(delegated.device);
      }
    }
  }

  // Another surface opened us with ?export=spotify[&device=…] — adopt that
  // surface's playlist, then run the site's normal export on it.
  async #startDelegatedExport(device) {
    // Strip the trigger params so a reload doesn't re-fire the export.
    const clean = new URL(window.location.href);
    clean.searchParams.delete('export');
    clean.searchParams.delete('device');
    window.history.replaceState(null, '', clean);

    if (device) {
      this.#engine.adoptDeviceId?.(device);
      // Let the adopted playlist reconcile from the cloud before exporting.
      await new Promise((resolve) => {
        const done = () => {
          this.#engine.removeEventListener?.('playlist-changed', done);
          resolve();
        };
        this.#engine.addEventListener?.('playlist-changed', done, { once: true });
        setTimeout(done, 2500);
      });
    }

    this.#setFlipped(true);
    this.#runSpotifyExport();
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
    if (name === 'spotify-client-id' || name === 'spotify-export-url') {
      // Export is offered when a host either runs its own OAuth
      // (spotify-client-id) or delegates to one that does (spotify-export-url).
      this.#spotifyExport.hidden =
        !this.getAttribute('spotify-client-id') && !this.getAttribute('spotify-export-url');
      return;
    }
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
        this.#updateSkipUI();
        this.dispatchEvent(new CustomEvent('playing-changed', { detail: e.detail }));
      },
      { signal }
    );

    engine.addEventListener(
      'skip-changed',
      (e) => {
        this.#updateSkipUI();
        this.dispatchEvent(new CustomEvent('skip-changed', { detail: e.detail }));
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
      'show-changed',
      () => this.#updateShowLine(),
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
    this.#updateSkipUI();

    const play = this.#engine.currentPlay;
    if (play) {
      this.#updateNowPlaying(play);
    }

    this.#updateShowLine();

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
    if (this.#engine.isSkipping) {
      // The stream is muted — say so, or silence reads as breakage.
      this.#marquee.textContent = 'Skipping — sound returns with the next song';
    } else if (isLikeablePlay(play)) {
      const artist = play.artist || 'Unknown Artist';
      const song = play.song || 'Unknown Song';
      this.#marquee.textContent = `Listening to: ${artist} - ${song} on 90.3 FM Seattle`;
    } else {
      this.#marquee.textContent = 'Air break — KEXP 90.3 FM Seattle';
    }

    const art = play?.thumbnail_uri ?? null;
    this.#nowArt.hidden = !art;
    if (art) {
      setArtwork(this.#nowArt, {
        url: art,
        artist: play.artist,
        album: play.album,
        onFail: () => {
          this.#nowArt.hidden = true;
        },
      });
    }

    this.#updateMarquee();
    this.#updateLikeUI();
  }

  #updateShowLine() {
    const show = this.#engine.currentShow;
    const text = show?.programName
      ? [show.programName, show.hostNames?.length ? show.hostNames.join(' & ') : null]
          .filter(Boolean)
          .join(' · ')
      : '';
    this.#showLine.hidden = !text;
    this.#showLine.textContent = text;
  }

  async #runSpotifyExport() {
    // Surfaces without their own OAuth (extension popup, menu bar) delegate
    // to the site, which owns the registered redirect. Carry this device's
    // id so the site adopts — and exports — THIS playlist.
    const exportUrl = this.getAttribute('spotify-export-url');
    if (exportUrl && !this.getAttribute('spotify-client-id')) {
      const id = this.#engine.deviceId;
      const url = id
        ? `${exportUrl}${exportUrl.includes('?') ? '&' : '?'}device=${encodeURIComponent(id)}`
        : exportUrl;
      window.open(url, '_blank', 'noopener');
      return;
    }

    const clientId = this.getAttribute('spotify-client-id');
    if (!clientId) return;

    const tracks = this.#engine.playlist;
    const status = this.#spotifyExportStatus;
    status.hidden = false;

    if (!tracks.length) {
      status.textContent = 'Nothing to export yet — heart some songs first.';
      return;
    }

    this.#spotifyExportButton.disabled = true;
    try {
      const result = await exportToSpotify({
        clientId,
        tracks,
        onStatus: (text) => {
          status.textContent = text;
        },
      });
      if (!result) return; // redirected to Spotify; we'll resume on return

      status.textContent = '';
      const summary = document.createElement('span');
      summary.textContent =
        result.added === 0 && result.missed.length === 0
          ? 'Already up to date — every song is in the playlist. '
          : `Added ${result.added} of ${result.total}. `;
      status.appendChild(summary);
      if (result.url) {
        const link = document.createElement('a');
        link.href = result.url;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = 'Open in Spotify';
        status.appendChild(link);
      }
      if (result.missed.length) {
        const detail = result.missed
          .slice(0, 3)
          .map((t) => `${t.artist} — ${t.song}`)
          .join(', ');
        const more = result.missed.length > 3 ? '…' : '';
        status.appendChild(
          document.createTextNode(
            ` Not on Spotify (${result.missed.length}): ${detail}${more}`
          )
        );
      }
    } catch (err) {
      status.textContent = err?.message ?? 'Spotify export failed — try again.';
    } finally {
      this.#spotifyExportButton.disabled = false;
    }
  }

  #updateSkipUI() {
    const skipping = Boolean(this.#engine.isSkipping);
    this.#skipButton.disabled = !this.#engine.isPlaying;
    this.#skipButton.classList.toggle('skipping', skipping);
    this.#skipButton.setAttribute('aria-pressed', String(skipping));
    this.#skipButton.setAttribute(
      'aria-label',
      skipping ? 'Cancel skip — unmute now' : 'Skip this song — mute until the next one'
    );
    // Refresh the marquee (it carries the "Skipping —" notice) — but never
    // stomp the initial "Loading…" text before the first play arrives.
    if (this.#engine.currentPlay || skipping) {
      this.#updateNowPlaying(this.#engine.currentPlay);
    }
  }

  #updateLikeUI() {
    const liked = this.#engine.isLiked;
    const play = this.#engine.currentPlay;
    const likeable = isLikeablePlay(play);

    // Airbreak: nothing to like or link to — the whole rail steps aside.
    this.#actionRail.hidden = !likeable;
    if (likeable) {
      const artist = play.artist || 'Unknown Artist';
      const song = play.song || 'Unknown Song';
      this.#youtubeRailLink.href = youtubeSearchUrl(artist, song);
      this.#youtubeRailLink.setAttribute('aria-label', `Find ${song} by ${artist} on YouTube`);
      this.#spotifyRailLink.href = spotifySearchUrl(artist, song);
      this.#spotifyRailLink.setAttribute('aria-label', `Find ${song} by ${artist} on Spotify`);
    }

    this.#likeButton.disabled = !likeable;
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

      // Expand toward iPhone 13 dimensions (390×844), clamped to the host —
      // leaving room for the marquee, chip, and page footer below the card,
      // which otherwise slide off-screen on short windows.
      const host = this.getBoundingClientRect();
      const targetW = Math.max(rect.width, Math.min(390, host.width - 24));
      const targetH = Math.max(rect.height, Math.min(844, host.height - 150));

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
      this.#hideArtistCard();
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
    // Never rebuild rows mid-drag (a background sync can land while the
    // user is dragging) — the drag's own commit re-renders afterwards.
    if (this.#playlistEl.querySelector('li.dragging')) return;

    // Keep keyboard reordering usable: re-renders restore handle focus.
    const active = this.shadowRoot.activeElement;
    const focusKey = active?.classList?.contains('dragHandle')
      ? active.closest('li')?.dataset.key
      : null;

    this.#playlistEl.textContent = '';
    const entries = this.#engine.playlist;
    this.#playlistEmpty.hidden = entries.length > 0;

    for (const track of entries) {
      const li = document.createElement('li');
      li.dataset.key = track.key;
      const artist = track.artist || 'Unknown Artist';
      const song = track.song || 'Unknown Song';

      const handle = document.createElement('button');
      handle.className = 'dragHandle';
      handle.type = 'button';
      handle.textContent = '⠿';
      handle.setAttribute('aria-label', `Reorder ${song} — drag, or use arrow keys`);
      this.#wireDragHandle(handle, li);

      // Album art doubles as the track-details hover target.
      const art = document.createElement('button');
      art.className = 'albumArt';
      art.type = 'button';
      art.setAttribute('aria-label', `About this play of ${song}`);
      if (track.thumbnail) {
        const img = document.createElement('img');
        img.alt = '';
        img.loading = 'lazy';
        setArtwork(img, {
          url: track.thumbnail,
          artist: track.artist,
          album: track.album,
          onFail: () => {
            img.remove();
            art.textContent = '♪';
          },
        });
        art.appendChild(img);
      } else {
        art.textContent = '♪';
      }
      const showTrack = () => this.#showTrackCard(li, track);
      art.addEventListener('pointerenter', showTrack);
      art.addEventListener('focus', showTrack);
      art.addEventListener('click', showTrack); // touch devices
      art.addEventListener('pointerleave', () => this.#scheduleHideArtistCard());
      art.addEventListener('blur', () => this.#scheduleHideArtistCard());

      const title = document.createElement('span');
      title.className = 'trackTitle';
      const scroll = document.createElement('span');
      scroll.className = 'trackScroll';

      if (artist !== 'Unknown Artist') {
        const artistButton = document.createElement('button');
        artistButton.className = 'artistLink';
        artistButton.type = 'button';
        artistButton.textContent = artist;
        artistButton.setAttribute('aria-label', `About ${artist}`);
        const show = () => this.#showArtistCard(li, artist);
        artistButton.addEventListener('pointerenter', show);
        artistButton.addEventListener('focus', show);
        artistButton.addEventListener('click', show); // touch devices
        artistButton.addEventListener('pointerleave', () => this.#scheduleHideArtistCard());
        artistButton.addEventListener('blur', () => this.#scheduleHideArtistCard());
        scroll.append(artistButton, ` — ${song}`);
      } else {
        scroll.textContent = `${artist} — ${song}`;
      }
      title.appendChild(scroll);

      // Ellipsized titles scroll on hover so the full name is readable.
      li.addEventListener('pointerenter', () => this.#startTitleMarquee(title, scroll));
      li.addEventListener('pointerleave', () => this.#stopTitleMarquee(title, scroll));

      const youtubeLink = document.createElement('a');
      youtubeLink.className = 'youtubeLink';
      youtubeLink.href = youtubeSearchUrl(artist, song);
      youtubeLink.target = '_blank';
      youtubeLink.rel = 'noopener noreferrer';
      youtubeLink.textContent = '▶';
      youtubeLink.setAttribute('aria-label', `Find ${song} by ${artist} on YouTube`);

      const spotifyLink = document.createElement('a');
      spotifyLink.className = 'spotifyLink';
      spotifyLink.href = spotifySearchUrl(artist, song);
      spotifyLink.target = '_blank';
      spotifyLink.rel = 'noopener noreferrer';
      spotifyLink.innerHTML =
        '<svg width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.56.3z"/></svg>';
      spotifyLink.setAttribute('aria-label', `Find ${song} by ${artist} on Spotify`);

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

      // Personal note: pencil button opens an inline editor; the saved note
      // lives under the title and is tappable to edit again.
      const noteButton = document.createElement('button');
      noteButton.className = `noteButton${track.note ? ' hasNote' : ''}`;
      noteButton.type = 'button';
      noteButton.textContent = '✎';
      noteButton.setAttribute(
        'aria-label',
        track.note ? `Edit your note on ${song}` : `Add a note to ${song}`
      );

      const noteText = document.createElement('p');
      noteText.className = 'noteText';
      noteText.hidden = !track.note;
      noteText.textContent = track.note ? `“${track.note}”` : '';

      const noteInput = document.createElement('input');
      noteInput.className = 'noteInput';
      noteInput.type = 'text';
      noteInput.placeholder = 'Why did this one get you?';
      noteInput.hidden = true;

      const openNoteEditor = () => {
        noteInput.hidden = false;
        noteText.hidden = true;
        noteInput.value = track.note ?? '';
        noteInput.focus();
      };

      // Close immediately and optimistically — remote engines (extension)
      // confirm via a later playlist-changed broadcast.
      const closeNoteEditor = (save) => {
        const value = noteInput.value.trim();
        noteInput.hidden = true;
        if (save) {
          this.#engine.setNote(track.key, value);
          noteText.textContent = value ? `“${value}”` : '';
          noteText.hidden = !value;
          noteButton.classList.toggle('hasNote', Boolean(value));
        } else {
          noteText.hidden = !track.note;
        }
      };

      // The pencil toggles: open the editor, or save-and-close it.
      noteButton.addEventListener('pointerdown', (event) => {
        if (!noteInput.hidden) {
          event.preventDefault(); // beat the input's blur handler to it
          closeNoteEditor(true);
        }
      });
      noteButton.addEventListener('click', () => {
        if (noteInput.hidden) openNoteEditor();
      });
      noteText.addEventListener('click', openNoteEditor);

      noteInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          closeNoteEditor(true);
        }
        if (event.key === 'Escape') {
          event.stopPropagation(); // keep the hover card open
          closeNoteEditor(false);
        }
      });
      noteInput.addEventListener('blur', () => {
        if (!noteInput.hidden) closeNoteEditor(true);
      });

      confirmBox.append(confirmLabel, confirmYes, confirmNo);
      const rowMain = document.createElement('div');
      rowMain.className = 'rowMain';
      rowMain.append(handle, art, title, youtubeLink, spotifyLink, noteButton, removeButton, confirmBox);
      li.append(rowMain, noteText, noteInput);
      this.#playlistEl.appendChild(li);
    }

    if (focusKey) {
      this.shadowRoot
        .querySelector(`li[data-key="${CSS.escape(focusKey)}"] .dragHandle`)
        ?.focus();
    }
  }

  // Pointer dragging (mouse + touch via pointer capture) and arrow-key
  // reordering share one commit path: read the DOM order, tell the engine.
  #wireDragHandle(handle, li) {
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      event.preventDefault();

      if (event.key === 'ArrowUp' && li.previousElementSibling) {
        this.#playlistEl.insertBefore(li, li.previousElementSibling);
      } else if (event.key === 'ArrowDown' && li.nextElementSibling) {
        this.#playlistEl.insertBefore(li.nextElementSibling, li);
      } else {
        return;
      }
      this.#commitPlaylistOrder();
    });

    handle.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      // Capture is best-effort (WebKit is picky); the document-level
      // listeners below do the real work — pointer events are composed,
      // so they cross the shadow boundary.
      try {
        handle.setPointerCapture(event.pointerId);
      } catch {
        /* fine without it */
      }
      li.classList.add('dragging');

      const onMove = (ev) => {
        const others = [...this.#playlistEl.children].filter((row) => row !== li);
        const next = others.find((row) => {
          const rect = row.getBoundingClientRect();
          return ev.clientY < rect.top + rect.height / 2;
        });
        if (next) {
          this.#playlistEl.insertBefore(li, next);
        } else {
          this.#playlistEl.appendChild(li);
        }
      };

      const onUp = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        li.classList.remove('dragging');
        this.#commitPlaylistOrder();
      };

      document.addEventListener('pointermove', onMove);
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    });
  }

  #commitPlaylistOrder() {
    const keys = [...this.#playlistEl.children].map((row) => row.dataset.key);
    this.#engine.reorder(keys);
  }

  // Hover-marquee for ellipsized playlist titles: glide to the end and back,
  // with a beat of rest at each edge.
  #startTitleMarquee(title, scroll) {
    if (this.#reducedMotion.matches) return;

    const distance = scroll.scrollWidth - title.clientWidth;
    if (distance <= 0) return;

    title.classList.add('scrolling');
    scroll.animate(
      [
        { transform: 'translateX(0)', offset: 0 },
        { transform: 'translateX(0)', offset: 0.1 },
        { transform: `translateX(${-distance - 4}px)`, offset: 0.9 },
        { transform: `translateX(${-distance - 4}px)`, offset: 1 },
      ],
      {
        duration: (distance / 30) * 1000 + 1200,
        iterations: Infinity,
        direction: 'alternate',
        easing: 'linear',
      }
    );
  }

  #stopTitleMarquee(title, scroll) {
    title.classList.remove('scrolling');
    for (const animation of scroll.getAnimations()) {
      animation.cancel();
    }
  }

  #showTrackCard(row, track) {
    clearTimeout(this.#hoverCardHideTimer);
    const token = `track:${track.key}`;
    this.#hoverCardArtist = token;

    const badges = [
      track.isLocal ? 'SEATTLE LOCAL' : null,
      track.isLive ? 'LIVE' : null,
      track.isRequest ? 'REQUEST' : null,
    ].filter(Boolean);

    const year = track.releaseDate ? String(track.releaseDate).slice(0, 4) : null;
    const meta = [
      track.album ? `From “${track.album}”` : null,
      year ? `released ${year}` : null,
      track.label ? `on ${track.label}` : null,
    ]
      .filter(Boolean)
      .join(' · ');

    this.#populateHoverCard({
      image: track.thumbnail,
      title: `${track.artist} — ${track.song}`,
      badges,
      meta: meta || 'No album details for this play.',
      // The DJ's own notes — and yours.
      extract: [track.comment, track.note ? `My note: “${track.note}”` : null]
        .filter(Boolean)
        .join('\n'),
      url: null,
    });
    this.#positionHoverCard(row);

    // Studio credits arrive late (MusicBrainz is rate-limited) — append them
    // if this card is still the one being shown.
    recordingCredits(track.artist, track.song).then((credits) => {
      if (!credits || this.#hoverCardArtist !== token) return;
      const metaEl = this.#hoverCard.querySelector('.hoverCardMeta');
      metaEl.textContent = metaEl.textContent ? `${metaEl.textContent} · ${credits}` : credits;
      metaEl.hidden = false;
      this.#positionHoverCard(row);
    });
  }

  async #showArtistCard(row, artist) {
    clearTimeout(this.#hoverCardHideTimer);
    this.#hoverCardArtist = artist;

    const data = await artistSummary(artist);

    // Bail if the pointer moved on (or the card was dismissed) mid-fetch.
    if (this.#hoverCardArtist !== artist) return;

    if (data) {
      this.#populateHoverCard({
        image: data.thumbnail,
        title: data.title,
        badges: [],
        meta: null,
        extract: data.extract,
        url: data.url,
        urlText: 'Read more on Wikipedia',
      });
    } else {
      // A silent nothing reads as broken — say so instead. (KEXP plays deep
      // cuts; plenty of artists haven't made it to Wikipedia yet.)
      this.#populateHoverCard({
        image: null,
        title: artist,
        badges: [],
        meta: 'Nothing on Wikipedia for this one — too underground. 🤘',
        extract: null,
        url: null,
      });
    }
    this.#positionHoverCard(row);

    // Last.fm enrichment (via the backend's edge function) arrives late:
    // genre tags become badges, listeners + similar artists join the meta.
    artistEnrichment(this.getAttribute('backend-url'), artist).then((extra) => {
      if (!extra || this.#hoverCardArtist !== artist) return;

      const badgesEl = this.#hoverCard.querySelector('.hoverCardBadges');
      if (extra.tags?.length && badgesEl.childElementCount === 0) {
        badgesEl.hidden = false;
        for (const tag of extra.tags) {
          const span = document.createElement('span');
          span.className = 'badge';
          span.textContent = tag.toUpperCase();
          badgesEl.appendChild(span);
        }
      }

      const line = [
        formatListeners(extra.listeners),
        extra.similar?.length ? `Similar: ${extra.similar.slice(0, 3).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
      if (line) {
        const metaEl = this.#hoverCard.querySelector('.hoverCardMeta');
        metaEl.textContent = metaEl.textContent ? `${metaEl.textContent} · ${line}` : line;
        metaEl.hidden = false;
      }
      this.#positionHoverCard(row);
    });
  }

  #populateHoverCard({ image, title, badges = [], meta, extract, url, urlText }) {
    const imageEl = this.#hoverCard.querySelector('.hoverCardImage');
    imageEl.hidden = !image;
    if (image) {
      imageEl.onerror = () => {
        imageEl.hidden = true;
      };
      imageEl.src = image;
    }

    this.#hoverCard.querySelector('.hoverCardTitle').textContent = title;

    const badgesEl = this.#hoverCard.querySelector('.hoverCardBadges');
    badgesEl.textContent = '';
    badgesEl.hidden = badges.length === 0;
    for (const badge of badges) {
      const span = document.createElement('span');
      span.className = 'badge';
      span.textContent = badge;
      badgesEl.appendChild(span);
    }

    const metaEl = this.#hoverCard.querySelector('.hoverCardMeta');
    metaEl.hidden = !meta;
    metaEl.textContent = meta ?? '';

    const extractEl = this.#hoverCard.querySelector('.hoverCardExtract');
    extractEl.hidden = !extract;
    extractEl.textContent = extract ?? '';

    const link = this.#hoverCard.querySelector('.hoverCardLink');
    link.hidden = !url;
    if (url) {
      link.href = url;
      link.textContent = urlText ?? 'Read more';
    }
  }

  #positionHoverCard(row) {
    const card = this.#hoverCard;
    card.hidden = false; // must be laid out to measure its height

    // Default below the row; flip above when the bottom rows would clip the
    // card against the panel's edge. Viewport rects so scroll is accounted
    // for; `top` is still set in the panel's scroll coords (shared parent).
    const container = card.offsetParent ?? row.offsetParent;
    const rowRect = row.getBoundingClientRect();
    const contRect = container.getBoundingClientRect();
    const cardHeight = card.offsetHeight;

    const roomBelow = contRect.bottom - rowRect.bottom;
    const roomAbove = rowRect.top - contRect.top;
    const flipUp = roomBelow < cardHeight + 12 && roomAbove > cardHeight + 12;

    card.style.top = flipUp
      ? `${row.offsetTop - cardHeight - 6}px`
      : `${row.offsetTop + row.offsetHeight + 6}px`;
  }

  #scheduleHideArtistCard() {
    clearTimeout(this.#hoverCardHideTimer);
    this.#hoverCardHideTimer = setTimeout(() => this.#hideArtistCard(), 200);
  }

  #hideArtistCard() {
    this.#hoverCardArtist = null;
    this.#hoverCard.hidden = true;
  }

  #emailPlaylist(event) {
    event.preventDefault();

    if (!this.#emailInput.reportValidity()) return;

    const lines = this.#engine.playlist.map((t) => {
      const year = t.releaseDate ? String(t.releaseDate).slice(0, 4) : null;
      const meta = [t.album, year, t.label].filter(Boolean).join(', ');
      const flags = [
        t.isLocal && 'Seattle local',
        t.isLive && 'live on KEXP',
        t.isRequest && 'listener request',
      ]
        .filter(Boolean)
        .join(' · ');

      const parts = [`${t.artist} — ${t.song}${meta ? ` (${meta})` : ''}`];
      if (flags) parts.push(`  ${flags}`);
      if (t.comment) {
        const dj = t.comment.length > 200 ? `${t.comment.slice(0, 197)}…` : t.comment;
        parts.push(`  DJ: ${dj}`);
      }
      if (t.note) parts.push(`  Me: ${t.note}`);
      return parts.join('\n');
    });

    const subject = 'My KEXP liked songs';
    const body = `${lines.join('\n\n')}\n\nHeard on KEXP 90.3 FM Seattle — kexp.org`;

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
