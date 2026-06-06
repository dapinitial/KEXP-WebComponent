// The headless heart of the player: stream control, now-playing polling, and
// the like store. No DOM, no styling — so it can run inside the web component,
// a browser-extension offscreen document, or a Tauri shell unchanged.

import { LikesBackend } from './likesBackend.js';

const KEXP_API_URL = 'https://api.kexp.org/v2/plays?ordering=-airdate&limit=1';

export const DEFAULT_STREAM_URL = 'https://kexp.streamguys1.com/kexp160.aac';
export const DEFAULT_POLL_INTERVAL_MS = 15000;
export const DEFAULT_VOLUME = 0.5;

const STORAGE_LIKES_KEY = 'kexp-player:likes';
const STORAGE_DEVICE_KEY = 'kexp-player:device-id';

// Airbreaks (and anything else without artist/song) aren't likeable.
export const isLikeablePlay = (play) => Boolean(play && (play.artist || play.song));

export const trackKey = (play) => `${play.artist}|${play.song}`;

const clampVolume = (value) => {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return DEFAULT_VOLUME;
  return Math.min(1, Math.max(0, parsed));
};

const normalizePollInterval = (value) => {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return DEFAULT_POLL_INTERVAL_MS;
  return parsed;
};

export class PlayerEngine extends EventTarget {
  #audio;
  #streamUrl;
  #volume;
  #pollInterval;

  #currentPlay = null;
  #isPlaying = false;
  #isTransitioning = false;
  #audioInitialized = false;
  #pollTimer = null;
  #pollingActive = false;
  #fetchController = null;
  #likedTracks;
  #errorMessage = null;
  #backend = null;
  #backendUrl = null;
  #backendKey = null;
  #globalLikes = 0;
  #countEpoch = 0;
  #reconciled = false;

  constructor({ audio, streamUrl, volume, pollInterval } = {}) {
    super();

    this.#audio = audio ?? new Audio();
    this.#audio.preload = 'none';
    this.#streamUrl = streamUrl || DEFAULT_STREAM_URL;
    this.#volume = clampVolume(volume ?? DEFAULT_VOLUME);
    this.#pollInterval = normalizePollInterval(pollInterval ?? DEFAULT_POLL_INTERVAL_MS);
    this.#likedTracks = this.#loadLikes();

    this.#audio.addEventListener('play', () => this.#setPlaying(true));
    this.#audio.addEventListener('pause', () => this.#setPlaying(false));
    this.#audio.addEventListener('error', () => this.#setError('Stream unavailable.'));
  }

  configure({ streamUrl, volume, pollInterval, backendUrl, backendKey } = {}) {
    if (streamUrl !== undefined) {
      this.#streamUrl = streamUrl || DEFAULT_STREAM_URL;
    }
    if (volume !== undefined) {
      this.#volume = clampVolume(volume);
      if (this.#audioInitialized) {
        this.#audio.volume = this.#volume;
      }
    }
    if (pollInterval !== undefined) {
      this.#pollInterval = normalizePollInterval(pollInterval);
      if (this.#pollingActive) {
        this.startPolling();
      }
    }
    if (backendUrl !== undefined || backendKey !== undefined) {
      const url = backendUrl ?? this.#backendUrl;
      const key = backendKey ?? this.#backendKey;
      if (url !== this.#backendUrl || key !== this.#backendKey) {
        this.#backendUrl = url;
        this.#backendKey = key;
        this.#backend = url && key ? new LikesBackend({ url, key }) : null;
        this.#reconciled = false;
        if (this.#backend) {
          this.#reconcile();
          this.#refreshGlobalCount(this.#currentPlay);
        }
      }
    }
  }

  get isPlaying() {
    return this.#isPlaying;
  }

  get currentPlay() {
    return this.#currentPlay;
  }

  get errorMessage() {
    return this.#errorMessage;
  }

  get isLiked() {
    return (
      isLikeablePlay(this.#currentPlay) && this.#likedTracks.has(trackKey(this.#currentPlay))
    );
  }

  get playlist() {
    return [...this.#likedTracks.entries()].map(([key, track]) => ({ key, ...track }));
  }

  // Stable anonymous identity for this browser — the future backend key.
  get deviceId() {
    try {
      let id = localStorage.getItem(STORAGE_DEVICE_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(STORAGE_DEVICE_KEY, id);
      }
      return id;
    } catch {
      return 'ephemeral';
    }
  }

  get globalLikes() {
    return this.#globalLikes;
  }

  snapshot() {
    return {
      isPlaying: this.#isPlaying,
      currentPlay: this.#currentPlay,
      playlist: this.playlist,
      isLiked: this.isLiked,
      errorMessage: this.#errorMessage,
      deviceId: this.deviceId,
      globalLikes: this.#globalLikes,
    };
  }

  play() {
    this.#initAudio();

    if (this.#isTransitioning || !this.#audio.paused) return;
    this.#isTransitioning = true;

    Promise.resolve(this.#audio.play())
      .then(() => this.#setError(null))
      .catch(() => this.#setError('Unable to play audio.'))
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

  toggleLike() {
    const play = this.#currentPlay;
    if (!isLikeablePlay(play)) return;

    const key = trackKey(play);
    const liked = !this.#likedTracks.has(key);
    const entry = liked
      ? {
          artist: play.artist || 'Unknown Artist',
          song: play.song || 'Unknown Song',
          airdate: play.airdate,
          likedAt: new Date().toISOString(),
        }
      : this.#likedTracks.get(key);

    if (liked) {
      this.#likedTracks.set(key, entry);
    } else {
      this.#likedTracks.delete(key);
    }

    this.#saveLikes();
    this.#syncLike(liked, entry);
    this.#countEpoch++; // invalidate any in-flight count fetch
    this.#setGlobalLikes(Math.max(0, this.#globalLikes + (liked ? 1 : -1)));
    this.#emitLikeChanged(liked, play);
  }

  removeLike(key) {
    const track = this.#likedTracks.get(key);
    if (!track) return;

    this.#likedTracks.delete(key);
    this.#saveLikes();
    this.#syncLike(false, track);
    if (isLikeablePlay(this.#currentPlay) && trackKey(this.#currentPlay) === key) {
      this.#countEpoch++; // invalidate any in-flight count fetch
      this.#setGlobalLikes(Math.max(0, this.#globalLikes - 1));
    }
    this.#emitLikeChanged(false, track);
  }

  startPolling() {
    this.stopPolling();
    this.#pollingActive = true;

    const poll = async () => {
      await this.#fetchNowPlaying();
      this.#pollTimer = setTimeout(poll, this.#pollInterval);
    };

    poll();
  }

  stopPolling() {
    this.#pollingActive = false;
    clearTimeout(this.#pollTimer);
    this.#pollTimer = null;
  }

  dispose() {
    this.stopPolling();
    this.#fetchController?.abort();

    // Release the stream connection; it will be re-established on next play.
    this.#audio.pause();
    this.#audio.removeAttribute('src');
    this.#audio.load();
    this.#audioInitialized = false;
  }

  #initAudio() {
    if (this.#audioInitialized) return;

    this.#audio.src = this.#streamUrl;
    this.#audio.volume = this.#volume;
    this.#audio.load();
    this.#audioInitialized = true;
  }

  #setPlaying(playing) {
    if (this.#isPlaying === playing) return;
    this.#isPlaying = playing;
    this.#emit('playing-changed', { isPlaying: playing });
  }

  #setError(message) {
    if (this.#errorMessage === message) return;
    this.#errorMessage = message;
    this.#emit('error-changed', { message });
  }

  #emitLikeChanged(liked, track) {
    this.#emit('like-changed', {
      liked,
      artist: track.artist,
      song: track.song,
      airdate: track.airdate,
      deviceId: this.deviceId,
      playlistSize: this.#likedTracks.size,
    });
  }

  #emit(event, detail) {
    this.dispatchEvent(new CustomEvent(event, { detail }));
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

      this.#setError(null);

      if (play && play.airdate !== this.#currentPlay?.airdate) {
        this.#currentPlay = play;
        this.#emit('track-changed', { play });
        this.#refreshGlobalCount(play);
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      this.#setError('Now playing info unavailable.');
    }
  }

  // Push a like/unlike to the backend, fire-and-forget. The local store is
  // the source of truth for this device; the backend can catch up later.
  #syncLike(liked, track) {
    if (!this.#backend || !track) return;

    const payload = {
      deviceId: this.deviceId,
      artist: track.artist,
      song: track.song,
      airdate: track.airdate,
    };
    (liked ? this.#backend.addLike(payload) : this.#backend.removeLike(payload)).catch(() => {});
  }

  // Merge the device's cloud playlist with local likes: union both ways.
  async #reconcile() {
    if (!this.#backend || this.#reconciled) return;
    this.#reconciled = true;

    try {
      const remote = await this.#backend.playlist(this.deviceId);
      const remoteKeys = new Set(remote.map((t) => trackKey(t)));
      let changed = false;

      for (const track of remote) {
        const key = trackKey(track);
        if (!this.#likedTracks.has(key)) {
          this.#likedTracks.set(key, track);
          changed = true;
        }
      }

      for (const [key, track] of this.#likedTracks) {
        if (!remoteKeys.has(key)) {
          this.#syncLike(true, track);
        }
      }

      if (changed) {
        this.#saveLikes();
        this.#emit('playlist-changed', { playlistSize: this.#likedTracks.size });
      }
    } catch {
      this.#reconciled = false; // offline — retry on next configure
    }
  }

  async #refreshGlobalCount(play) {
    if (!this.#backend || !isLikeablePlay(play)) {
      this.#setGlobalLikes(0);
      return;
    }

    const epoch = this.#countEpoch;
    try {
      const count = await this.#backend.songLikeCount(
        play.artist || 'Unknown Artist',
        play.song || 'Unknown Song'
      );
      // Ignore the result if the track changed — or an optimistic local
      // update landed — while we were fetching.
      if (epoch === this.#countEpoch && play.airdate === this.#currentPlay?.airdate) {
        this.#setGlobalLikes(count);
      }
    } catch {
      // Count is decorative — never break the player over it.
    }
  }

  #setGlobalLikes(count) {
    if (count === this.#globalLikes) return;
    this.#globalLikes = count;
    this.#emit('count-changed', { count });
  }

  #loadLikes() {
    try {
      const entries = JSON.parse(localStorage.getItem(STORAGE_LIKES_KEY) ?? '[]');
      // Drop malformed entries (e.g., airbreaks liked before they were blocked).
      return new Map(entries.filter(([, t]) => t && (t.artist || t.song)));
    } catch {
      return new Map();
    }
  }

  #saveLikes() {
    try {
      localStorage.setItem(
        STORAGE_LIKES_KEY,
        JSON.stringify([...this.#likedTracks.entries()].map(([k, { key, ...t }]) => [k, t]))
      );
    } catch {
      // Private browsing / storage denied — likes stay in memory for the session.
    }
  }
}
