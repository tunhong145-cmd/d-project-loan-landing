-- Add only copy6 configuration rows; preserve all existing pixel settings.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
alter table public.repository_fb_pixels drop constraint repository_fb_pixels_site_id_check;
alter table public.repository_fb_pixels add constraint repository_fb_pixels_site_id_check
  check(site_id in ('main','copy1','copy2','copy3','copy4','copy5','copy6'));
insert into public.repository_fb_pixels(site_id,variant,pixel_ids)
select 'copy6',variant,'[]'::jsonb
from (values('C'),('E'),('F'),('G'),('I'),('J'),('K')) v(variant)
on conflict(site_id,variant) do nothing;
commit;
select site_id,count(*) as versions,sum(jsonb_array_length(pixel_ids)) as pixel_count
from public.repository_fb_pixels where site_id='copy6' group by site_id;
