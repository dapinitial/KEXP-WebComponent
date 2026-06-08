// Spotify playlist export — Authorization Code with PKCE, entirely in the
// browser. No client secret exists in this flow; the client ID is public by
// design (like the Supabase publishable key). Tokens live in sessionStorage
// only: connecting Spotify is the player's single, explicitly opt-in
// exception to "no accounts" — see /kexp/privacy.

const AUTH_URL = 'https://accounts.spotify.com/authorize';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API = 'https://api.spotify.com/v1';
const SCOPES = 'playlist-modify-private playlist-read-private';
const PLAYLIST_NAME = 'KEXP Likes';
const PLAYLIST_DESCRIPTION =
  'Songs hearted on davidpuerto.com/kexp — heard live on KEXP 90.3 FM Seattle.';

const VERIFIER_KEY = 'kexp-spotify:verifier';
const STATE_KEY = 'kexp-spotify:state';
const TOKEN_KEY = 'kexp-spotify:token';
const PENDING_KEY = 'kexp-spotify:pending-export';

const base64url = (bytes) =>
  btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

// Must exactly match a redirect URI registered on the Spotify app:
// https://davidpuerto.com/kexp/ in production, http://127.0.0.1:5173/ in
// dev. NOTE: develop this flow at 127.0.0.1, not localhost — they are
// different origins, and the PKCE verifier waits in sessionStorage across
// the redirect. (Spotify's rules don't allow registering "localhost".)
function redirectUri() {
  const path = window.location.pathname.endsWith('/')
    ? window.location.pathname
    : window.location.pathname.replace(/[^/]*$/, '');
  return `${window.location.origin}${path}`;
}

function readToken() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(TOKEN_KEY) ?? 'null');
    if (stored && stored.expiresAt > Date.now() + 30_000) return stored.accessToken;
  } catch {
    // fall through
  }
  return null;
}

function storeToken(data) {
  sessionStorage.setItem(
    TOKEN_KEY,
    JSON.stringify({
      accessToken: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    })
  );
}

// Full-page redirect to Spotify's consent screen. The pending-export flag
// makes the user's click survive the round-trip.
async function beginAuth(clientId) {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))
  );
  const state = base64url(crypto.getRandomValues(new Uint8Array(12)));

  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  sessionStorage.setItem(PENDING_KEY, '1');

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
    state,
  });
  window.location.assign(`${AUTH_URL}?${params}`);
}

// True when the current URL is Spotify sending the user back to us.
export function hasPendingExport() {
  const params = new URLSearchParams(window.location.search);
  return (
    sessionStorage.getItem(PENDING_KEY) === '1' && (params.has('code') || params.has('error'))
  );
}

async function completeAuth(clientId) {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  // Strip ?code=&state= so a reload doesn't replay a used code.
  const clean = new URL(window.location.href);
  clean.searchParams.delete('code');
  clean.searchParams.delete('state');
  clean.searchParams.delete('error');
  window.history.replaceState(null, '', clean);

  const expectedState = sessionStorage.getItem(STATE_KEY);
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);

  if (error) throw new Error(error === 'access_denied' ? 'Spotify access declined.' : error);
  if (!code || !verifier || state !== expectedState) {
    throw new Error('Spotify sign-in could not be verified — try again.');
  }

  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!response.ok) throw new Error('Spotify sign-in failed — try again.');
  storeToken(await response.json());
}

async function api(token, path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`Spotify API error (${response.status})`);
  return response.json();
}

async function findOrCreatePlaylist(token) {
  const me = await api(token, '/me');
  const mine = await api(token, '/me/playlists?limit=50');
  const existing = mine.items?.find((p) => p.name === PLAYLIST_NAME && p.owner?.id === me.id);
  if (existing) return existing;

  return api(token, `/users/${encodeURIComponent(me.id)}/playlists`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: PLAYLIST_NAME, public: false, description: PLAYLIST_DESCRIPTION }),
  });
}

async function existingUris(token, playlist) {
  const uris = new Set();
  let url = `/playlists/${playlist.id}/tracks?fields=items(track(uri)),next&limit=100`;
  while (url) {
    const page = await api(token, url);
    for (const item of page.items ?? []) {
      if (item.track?.uri) uris.add(item.track.uri);
    }
    url = page.next ? page.next.replace(API, '') : null;
  }
  return uris;
}

async function matchTrack(token, { artist, song }) {
  const precise = await api(
    token,
    `/search?type=track&limit=1&q=${encodeURIComponent(`track:${song} artist:${artist}`)}`
  );
  const hit = precise.tracks?.items?.[0];
  if (hit) return hit.uri;

  const loose = await api(
    token,
    `/search?type=track&limit=1&q=${encodeURIComponent(`${artist} ${song}`)}`
  );
  return loose.tracks?.items?.[0]?.uri ?? null;
}

// The main entry: authenticates if needed (full-page round-trip), matches
// every liked track, and adds the new ones to the "KEXP Likes" playlist.
// onStatus(text) narrates progress. Returns {added, missed, total, url}.
export async function exportToSpotify({ clientId, tracks, onStatus = () => {} }) {
  let token = readToken();

  if (!token && hasPendingExport()) {
    sessionStorage.removeItem(PENDING_KEY);
    onStatus('Connecting to Spotify…');
    await completeAuth(clientId);
    token = readToken();
  }

  if (!token) {
    onStatus('Heading to Spotify…');
    await beginAuth(clientId); // navigates away; nothing runs after this
    return null;
  }
  sessionStorage.removeItem(PENDING_KEY);

  onStatus('Finding your KEXP Likes playlist…');
  const playlist = await findOrCreatePlaylist(token);
  const already = await existingUris(token, playlist);

  const uris = [];
  const missed = [];
  for (const [i, track] of tracks.entries()) {
    onStatus(`Matching ${i + 1} of ${tracks.length}: ${track.artist} — ${track.song}`);
    const uri = await matchTrack(token, track);
    if (!uri) missed.push(track);
    else if (!already.has(uri)) uris.push(uri);
  }

  for (let i = 0; i < uris.length; i += 100) {
    onStatus('Adding songs…');
    await api(token, `/playlists/${playlist.id}/tracks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
    });
  }

  return {
    added: uris.length,
    missed,
    total: tracks.length,
    url: playlist.external_urls?.spotify ?? null,
  };
}
