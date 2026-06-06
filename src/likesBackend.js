// Zero-dependency Supabase client for the likes backend. Speaks PostgREST
// directly over fetch — no supabase-js, in keeping with the rest of the
// project. The anon key is public by design; row access is governed by RLS
// and device-scoped RPCs (see supabase/migrations).

export class LikesBackend {
  #base;
  #key;

  constructor({ url, key }) {
    this.#base = url.replace(/\/$/, '');
    this.#key = key;
  }

  #headers() {
    // Publishable keys go in the apikey header only (no Bearer JWT).
    return {
      apikey: this.#key,
      'Content-Type': 'application/json',
    };
  }

  async addLike({ deviceId, artist, song, airdate }) {
    // Plain insert: the unique constraint turns a duplicate into a 409, which
    // we treat as success ("already liked"). An upsert would require a SELECT
    // policy for the conflict check — we deliberately don't grant one.
    const response = await fetch(`${this.#base}/rest/v1/likes`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify({ device_id: deviceId, artist, song, airdate }),
    });
    if (!response.ok && response.status !== 409) {
      throw new Error(`addLike failed with ${response.status}`);
    }
  }

  async removeLike({ deviceId, artist, song }) {
    await this.#rpc('remove_like', { p_device: deviceId, p_artist: artist, p_song: song });
  }

  async playlist(deviceId) {
    const rows = await this.#rpc('device_playlist', { p_device: deviceId });
    return Array.isArray(rows)
      ? rows.map((r) => ({
          artist: r.artist,
          song: r.song,
          airdate: r.airdate,
          likedAt: r.liked_at,
        }))
      : [];
  }

  async songLikeCount(artist, song) {
    const count = await this.#rpc('song_like_count', { p_artist: artist, p_song: song });
    return typeof count === 'number' ? count : 0;
  }

  async #rpc(name, args) {
    const response = await fetch(`${this.#base}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: this.#headers(),
      body: JSON.stringify(args),
    });
    if (!response.ok) {
      throw new Error(`${name} failed with ${response.status}`);
    }
    return response.json();
  }
}
