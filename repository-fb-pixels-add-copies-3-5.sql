-- After repository-fb-pixels-add-copy-g.sql; expand FB-only site IDs and seed blank rows.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
alter table public.repository_fb_pixels drop constraint repository_fb_pixels_site_id_check;
alter table public.repository_fb_pixels add constraint repository_fb_pixels_site_id_check
  check(site_id in ('main','copy1','copy2','copy3','copy4','copy5'));
insert into public.repository_fb_pixels(site_id,variant,pixel_ids)
select s.site_id,v.variant,'[]'::jsonb
from (values('copy3'),('copy4'),('copy5')) s(site_id)
cross join (values('C'),('E'),('F'),('G'),('I'),('J'),('K')) v(variant)
on conflict(site_id,variant) do nothing;
notify pgrst,'reload schema';
commit;
select site_id,count(*) as versions,sum(jsonb_array_length(pixel_ids)) as pixel_count
from public.repository_fb_pixels where site_id in ('copy3','copy4','copy5') group by site_id order by site_id;
