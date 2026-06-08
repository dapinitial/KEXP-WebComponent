// Artist summaries from Wikipedia's REST API — free, no key, CORS-friendly.
// Results (including misses) are cached per artist for the session; failures
// are not cached so a flaky network can recover.

const SUMMARY_URL = 'https://en.wikipedia.org/api/rest_v1/page/summary/';

const cache = new Map();

// "Jamie xx feat. Honey Dijon" has no Wikipedia article — "Jamie xx" does.
// Look up the primary artist, not the collaboration billing.
function primaryArtist(artist) {
  return artist.replace(/\s+(?:feat\.?|ft\.?|featuring|with|x)\s+.*$/i, '').trim() || artist;
}

export function artistSummary(billedArtist) {
  if (!billedArtist || billedArtist === 'Unknown Artist') return Promise.resolve(null);
  const artist = primaryArtist(billedArtist);

  if (!cache.has(artist)) {
    const promise = fetch(`${SUMMARY_URL}${encodeURIComponent(artist)}`, {
      credentials: 'omit',
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) =>
        data && data.extract
          ? {
              title: data.title,
              extract: data.extract,
              thumbnail: data.thumbnail?.source ?? null,
              url: data.content_urls?.desktop?.page ?? null,
            }
          : null
      )
      .catch(() => {
        cache.delete(artist); // network error — allow a retry later
        return null;
      });

    cache.set(artist, promise);
  }

  return cache.get(artist);
}

export function youtubeSearchUrl(artist, song) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(`${artist} ${song}`)}`;
}

export function spotifySearchUrl(artist, song) {
  return `https://open.spotify.com/search/${encodeURIComponent(`${artist} ${song}`)}`;
}
