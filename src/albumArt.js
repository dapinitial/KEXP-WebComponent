// Album-art resilience. KEXP's thumbnail URLs live on the Cover Art Archive,
// which has bad days (transient 500s). Strategy per image: original → one
// quiet retry → iTunes Search artwork (keyless, CORS-friendly) → caller's
// fallback (♪ / hide).

const RETRY_DELAY_MS = 1500;

const itunesCache = new Map(); // "artist|album" → Promise<string|null>

export function itunesArtwork(artist, album) {
  if (!artist || !album) return Promise.resolve(null);
  const key = `${artist}|${album}`;
  if (!itunesCache.has(key)) {
    const term = encodeURIComponent(`${artist} ${album}`);
    const promise = fetch(`https://itunes.apple.com/search?term=${term}&entity=album&limit=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => data?.results?.[0]?.artworkUrl100?.replace('100x100', '600x600') ?? null)
      .catch(() => {
        itunesCache.delete(key); // network error — allow a retry later
        return null;
      });
    itunesCache.set(key, promise);
  }
  return itunesCache.get(key);
}

// Newer assignment to the same <img> cancels any in-flight fallback chain.
const tokens = new WeakMap();

export function setArtwork(img, { url, artist, album, onFail }) {
  const token = Symbol('art');
  tokens.set(img, token);
  const live = () => tokens.get(img) === token;

  let stage = 0;
  img.onerror = async () => {
    if (!live()) return;
    stage += 1;

    if (stage === 1) {
      // Often a transient archive hiccup — retry once, quietly.
      setTimeout(() => {
        if (!live()) return;
        img.src = `${url}${url.includes('?') ? '&' : '?'}retry=1`;
      }, RETRY_DELAY_MS);
      return;
    }

    if (stage === 2) {
      const alt = await itunesArtwork(artist, album);
      if (!live()) return;
      if (alt) {
        img.src = alt; // if this also errors, stage 3 lands in onFail
        return;
      }
    }

    onFail?.();
  };
  img.src = url;
}
