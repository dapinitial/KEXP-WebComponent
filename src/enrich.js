// Artist enrichment via the Supabase edge function (which holds the Last.fm
// key — no secrets in the browser). Session-cached; a missing or failing
// endpoint simply means no extra line on the hover card.

const cache = new Map();

export function artistEnrichment(backendUrl, artist) {
  if (!backendUrl || !artist || artist === 'Unknown Artist') return Promise.resolve(null);
  const key = artist;

  if (!cache.has(key)) {
    const url = `${backendUrl.replace(/\/$/, '')}/functions/v1/enrich?artist=${encodeURIComponent(artist)}`;
    const promise = fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!data || data.error) return null;
        const hasAnything =
          data.listeners || data.tags?.length || data.similar?.length;
        return hasAnything ? data : null;
      })
      .catch(() => {
        cache.delete(key); // network hiccup — allow a retry later
        return null;
      });
    cache.set(key, promise);
  }

  return cache.get(key);
}

export function formatListeners(listeners) {
  if (!listeners) return null;
  const compact = new Intl.NumberFormat('en', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(listeners);
  return `${compact} listeners`;
}
