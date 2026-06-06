-- KEXP player likes: anonymous per-device model.
-- device_id is an unguessable UUIDv4 acting as a bearer capability — no auth,
-- no PII. Public clients may INSERT likes; reads and removals only happen
-- through RPCs scoped to a device_id, and global numbers are exposed as
-- aggregates only (no raw rows, no device enumeration).

create table if not exists likes (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null,
  artist text not null,
  song text not null,
  airdate timestamptz,
  album text,
  release_date text,
  thumbnail text,
  label text,
  comment text,
  note text,
  is_local boolean not null default false,
  liked_at timestamptz not null default now(),
  unique (device_id, artist, song)
);

-- Global count lookups by song.
create index if not exists likes_song_idx on likes (artist, song);

alter table likes enable row level security;

-- Anyone can like. No public select/update/delete policies exist — raw rows
-- are unreachable through the Data API.
create policy "anyone can like" on likes
  for insert to anon, authenticated
  with check (true);

-- Remove one like, scoped to the device that owns it. SECURITY DEFINER is
-- required because anon has no delete policy; the device_id equality in the
-- WHERE clause is the authorization check (capability model).
create or replace function remove_like(p_device uuid, p_artist text, p_song text)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.likes
  where device_id = p_device and artist = p_artist and song = p_song;
$$;

-- A device's playlist: only that device's rows, newest first.
create or replace function device_playlist(p_device uuid)
returns table (
  artist text,
  song text,
  airdate timestamptz,
  album text,
  release_date text,
  thumbnail text,
  label text,
  comment text,
  note text,
  is_local boolean,
  liked_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select artist, song, airdate, album, release_date, thumbnail, label, comment, note, is_local, liked_at
  from public.likes
  where device_id = p_device
  order by liked_at desc;
$$;

-- Set (or clear) the personal note on one like, scoped to its device.
create or replace function set_note(p_device uuid, p_artist text, p_song text, p_note text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.likes
  set note = nullif(trim(p_note), '')
  where device_id = p_device and artist = p_artist and song = p_song;
$$;

-- Global like count for one song — aggregate only.
create or replace function song_like_count(p_artist text, p_song text)
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select count(*) from public.likes
  where artist = p_artist and song = p_song;
$$;
