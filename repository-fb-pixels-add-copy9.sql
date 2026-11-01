-- Add copy9 metadata and seven empty pixel rows only. No order, LINE or counter writes.
begin;
set local lock_timeout='5s';
set local statement_timeout='15s';
alter table public.repository_fb_pixels drop constraint if exists repository_fb_pixels_site_id_check;
alter table public.repository_fb_pixels add constraint repository_fb_pixels_site_id_check
 check(site_id in ('main','copy1','copy2','copy3','copy4','copy5','copy6','copy7','copy8','copy9'));
alter table public.repository_display_settings drop constraint if exists repository_display_settings_site_id_check;
alter table public.repository_display_settings add constraint repository_display_settings_site_id_check
 check(site_id in ('main','copy1','copy2','copy3','copy4','copy5','copy6','copy7','copy8','copy9'));
insert into public.repository_fb_pixels(site_id,variant,pixel_ids)
select 'copy9',variant,'[]'::jsonb from (values('C'),('E'),('F'),('G'),('I'),('J'),('K')) v(variant)
on conflict(site_id,variant) do nothing;
insert into public.repository_display_settings(site_id,name,domain)
values('copy9','複製倉庫九','tunhong145-cmd.github.io')
on conflict(site_id) do nothing;
commit;
select site_id,count(*) as version_count,sum(jsonb_array_length(pixel_ids)) as pixel_count
from public.repository_fb_pixels where site_id='copy9' group by site_id;
select site_id,name,domain,revision from public.repository_display_settings where site_id='copy9';
