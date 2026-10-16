-- Apply after repository-fb-pixels.sql. Add G to both copies, never overwrite pixels.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';
alter table public.repository_fb_pixels
  drop constraint if exists repository_fb_pixels_check;
insert into public.repository_fb_pixels(site_id, variant, pixel_ids)
values ('copy1','G','[]'::jsonb), ('copy2','G','[]'::jsonb)
on conflict (site_id, variant) do nothing;
notify pgrst, 'reload schema';
commit;
select site_id, variant, jsonb_array_length(pixel_ids) as pixel_count
from public.repository_fb_pixels where variant='G' order by site_id;
