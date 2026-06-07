-- device_playlist gains the position column so cloud playlists keep their
-- drag-and-drop order. Return type changes require drop + recreate.

drop function if exists public.device_playlist(uuid);

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
  position int,
  is_local boolean,
  liked_at timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select artist, song, airdate, album, release_date, thumbnail, label, comment, note, position, is_local, liked_at
  from public.likes
  where device_id = p_device
  order by position nulls last, liked_at desc;
$$;
