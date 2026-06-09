// Artist enrichment proxy: the browser asks us, we ask Last.fm with the
// secret API key (set via `supabase secrets set LASTFM_API_KEY=…`), and the
// response is trimmed to exactly what the hover card shows. Public data
// only — no user identity in either direction. Deployed --no-verify-jwt:
// this endpoint is as public as the data it serves.

const LASTFM = 'https://ws.audioscrobbler.com/2.0/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS, ...extra },
  });
}

async function lastfm(method: string, artist: string, params: Record<string, string> = {}) {
  const key = Deno.env.get('LASTFM_API_KEY');
  if (!key) throw new Error('LASTFM_API_KEY not configured');
  const url = new URL(LASTFM);
  url.searchParams.set('method', method);
  url.searchParams.set('artist', artist);
  url.searchParams.set('api_key', key);
  url.searchParams.set('format', 'json');
  url.searchParams.set('autocorrect', '1');
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const response = await fetch(url);
  if (!response.ok) return null;
  return response.json();
}

// Public endpoint, but it spends our Last.fm quota and Supabase invocations,
// so turn away requests that aren't one of our own surfaces. The 24h CDN
// cache absorbs legit repeats; this just stops drive-by scripting. (A
// determined caller can spoof these headers — acceptable for read-only,
// cached, public music data.)
function fromOurSurface(req: Request): boolean {
  const who = req.headers.get('origin') || req.headers.get('referer') || '';
  return (
    who.includes('davidpuerto.com') ||
    who.startsWith('chrome-extension://') ||
    who.startsWith('moz-extension://') ||
    who.startsWith('tauri://') ||
    who.includes('tauri.localhost') ||
    who.includes('localhost') ||
    who.includes('127.0.0.1')
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  if (!fromOurSurface(req)) return json({ error: 'forbidden' }, 403);

  const artist = new URL(req.url).searchParams.get('artist')?.trim();
  if (!artist) return json({ error: 'artist required' }, 400);

  try {
    const [info, similar] = await Promise.all([
      lastfm('artist.getinfo', artist),
      lastfm('artist.getsimilar', artist, { limit: '5' }),
    ]);

    const stats = info?.artist?.stats;
    const payload = {
      listeners: stats?.listeners ? Number(stats.listeners) : null,
      playcount: stats?.playcount ? Number(stats.playcount) : null,
      tags: (info?.artist?.tags?.tag ?? []).slice(0, 4).map((t: { name: string }) => t.name),
      similar: (similar?.similarartists?.artist ?? []).map((a: { name: string }) => a.name),
      url: info?.artist?.url ?? null,
    };

    // Artist facts move slowly — let Supabase's CDN absorb repeat lookups.
    return json(payload, 200, { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' });
  } catch (err) {
    return json({ error: String(err) }, 502);
  }
});
