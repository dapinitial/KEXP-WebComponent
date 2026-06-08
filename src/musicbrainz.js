// Recording credits from MusicBrainz — keyless and CORS-friendly, but
// strictly rate-limited (1 req/s). A promise chain spaces requests out and a
// session cache makes each track cost at most two (search → lookup).

const API = 'https://musicbrainz.org/ws/2';
const GAP_MS = 1100;

const cache = new Map(); // "artist|song" → Promise<string|null>
let chain = Promise.resolve();

function throttled(fn) {
  const run = chain.then(fn, fn);
  const gap = () => new Promise((resolve) => setTimeout(resolve, GAP_MS));
  chain = run.then(gap, gap);
  return run;
}

async function mb(path) {
  const response = await fetch(`${API}${path}&fmt=json`, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`MusicBrainz ${response.status}`);
  return response.json();
}

const ROLES = [
  ['producer', 'Produced by'],
  ['mix', 'Mixed by'],
  ['recording', 'Recorded by'],
  ['engineer', 'Engineered by'],
];

// Resolves to a credits line ("Produced by Jack Endino · Mixed by …") or
// null when MusicBrainz has nothing for this recording.
export function recordingCredits(artist, song) {
  if (!artist || !song) return Promise.resolve(null);
  const key = `${artist}|${song}`;

  if (!cache.has(key)) {
    const promise = (async () => {
      const query = encodeURIComponent(`recording:"${song}" AND artist:"${artist}"`);
      const search = await throttled(() => mb(`/recording/?query=${query}&limit=1`));
      const id = search.recordings?.[0]?.id;
      if (!id) return null;

      const detail = await throttled(() => mb(`/recording/${id}?inc=artist-rels`));
      const byRole = new Map();
      for (const rel of detail.relations ?? []) {
        const name = rel.artist?.name;
        if (!name) continue;
        const names = byRole.get(rel.type) ?? [];
        if (!names.includes(name)) names.push(name);
        byRole.set(rel.type, names);
      }

      const parts = ROLES.filter(([type]) => byRole.has(type)).map(
        ([type, label]) => `${label} ${byRole.get(type).join(', ')}`
      );
      return parts.length ? parts.join(' · ') : null;
    })().catch(() => {
      cache.delete(key); // network hiccup — allow a retry later
      return null;
    });

    cache.set(key, promise);
  }

  return cache.get(key);
}
