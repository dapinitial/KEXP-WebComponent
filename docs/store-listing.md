# Store listing — KEXP Player (Unofficial)

> **GATE: do not submit anywhere until KEXP blesses the name/use.**
> Target name: **KEXP Player (Unofficial)** — adjust if KEXP asks for
> different wording. Everything below is ready to paste once that lands.

## Copy (shared by both stores)

**Name:** KEXP Player (Unofficial)

**Summary** (Chrome limit 132 chars — this is 124):

> Seattle's KEXP 90.3 FM in your toolbar — stream live, see what's playing,
> heart songs, and keep a playlist. No account.

**Detailed description:**

> The best radio station on earth, one click away.
>
> Hit play and KEXP 90.3 FM streams live — and keeps playing after you close
> the popup. The popup always knows what's on air: artist, song, album art,
> and which show and DJ you're listening to.
>
> Heart a song you love and it lands in your playlist with album art, the
> label, and room for your own notes. Drag to reorder, or email yourself the
> list. Your liked-song count rides along as a badge on the toolbar icon.
>
> No account, no sign-up, no tracking. Your playlist is keyed to a random
> anonymous ID — visit davidpuerto.com/kexp in the same browser and the
> website and extension share one playlist automatically.
>
> This is an independent fan project, not an official KEXP product. KEXP
> kindly permits use of their public API. If you love what KEXP does,
> donate: https://kexp.org/donate
>
> Privacy policy: https://davidpuerto.com/kexp/privacy/

**Privacy policy URL:** https://davidpuerto.com/kexp/privacy/

**Support email:** me@davidpuerto.com
**Homepage:** https://davidpuerto.com/kexp/ · source: https://github.com/dapinitial/KEXP-WebComponent

## Assets

| Asset | File | Status |
| --- | --- | --- |
| Icon 16/32/48/128 | `extension/public/icons/icon*.png` | ✅ ships in the build |
| Screenshot 1280×800 — now playing | `docs/store-assets/screenshot-1-now-playing.png` | ✅ regenerate: `node scripts/gen-store-screenshots.mjs` |
| Screenshot 1280×800 — playlist | `docs/store-assets/screenshot-2-playlist.png` | ✅ same |
| Popup capture (Sonic Youth) | `docs/screenshots/extension.png` | optional — crop to 1280×800 or 640×400 if used |
| Small promo tile 440×280 (Chrome, optional) | — | not made; optional, can skip for v1 |

## Chrome Web Store (one-time $5 dev fee)

- ZIP to upload: contents of `dist-extension/` (`npm run build:extension`)
- Category: **Entertainment** · Language: English
- **Single purpose** (privacy tab): "Stream KEXP 90.3 FM live and keep a
  personal playlist of songs heard on air."
- **Permission justifications:**
  - `offscreen` — hosts the audio player so the stream keeps playing after
    the popup closes (reason: AUDIO_PLAYBACK).
  - `api.kexp.org` — fetch what's currently playing (KEXP's public API).
  - `kexp.streamguys1.com` — the live audio stream itself.
  - `jodgbwwnbrotuceanghk.supabase.co` — stores the user's liked songs
    keyed to a random anonymous ID.
  - Content script on `davidpuerto.com/kexp` — shares the anonymous device
    ID with the companion website so both surfaces use one playlist. Runs
    nowhere else.
- **Data disclosure:** check only **User activity** (songs the user hearts
  + optional notes, keyed to a random ID; no PII). Affirm: not sold, not
  shared with third parties, not used for unrelated purposes.

## Firefox Add-ons (AMO) (free)

- ZIP to upload: contents of `dist-extension-firefox/`
  (`npm run build:extension:firefox`)
- Add-on ID already pinned in the manifest: `kexp-player@davidpuerto.com`
- Category: **Photos, Music & Videos** · License: **MIT**
- **Source code submission** (required — the build is bundled): point to the
  GitHub repo and include build instructions:
  Node 22.x → `npm ci` → `npm run build:extension:firefox` → output in
  `dist-extension-firefox/` matches the uploaded ZIP byte-for-byte.
- Privacy policy: paste the same URL (AMO also accepts inline text).

## Pre-submission checklist

- [ ] KEXP reply received and name agreed ← **the gate**
- [ ] Bump `version` to `1.0.0` in both manifests
- [ ] `npm test` green (84/84 ×3 browsers)
- [ ] Rebuild both ZIPs from a clean `npm ci`
- [ ] Fresh screenshots if the on-air ones feel stale
- [ ] Load each ZIP unpacked once and click through play/like/playlist
