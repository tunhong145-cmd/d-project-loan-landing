-- Additive FB-only configuration. No order, LINE, TikTok or counter mutations.
begin;
create or replace function public.valid_repository_fb_pixels(value jsonb)
returns boolean language sql immutable set search_path = '' as $$
  select case when jsonb_typeof(value) <> 'array' then false else
    jsonb_array_length(value) <= 5
    and not exists (select 1 from jsonb_array_elements(value) p
      where jsonb_typeof(p) <> 'object' or coalesce(p->>'id','') !~ '^[0-9]{8,20}$'
      or jsonb_typeof(p->'enabled') is distinct from 'boolean')
    and (select count(*)=count(distinct p->>'id') from jsonb_array_elements(value) p)
  end;
$$;
create table if not exists public.repository_fb_pixels (
  site_id text not null check(site_id in ('main','copy1','copy2')),
  variant text not null check(variant in ('C','E','F','G','I','J','K')),
  pixel_ids jsonb not null default '[]'::jsonb check(public.valid_repository_fb_pixels(pixel_ids)),
  updated_at timestamptz not null default now(),
  primary key(site_id,variant),
  check(site_id='main' or variant<>'G')
);
alter table public.repository_fb_pixels enable row level security;
revoke all on public.repository_fb_pixels from anon, authenticated;
grant select on public.repository_fb_pixels to anon, authenticated;
grant update(pixel_ids,updated_at) on public.repository_fb_pixels to authenticated;
drop policy if exists repository_fb_read on public.repository_fb_pixels;
create policy repository_fb_read on public.repository_fb_pixels for select to anon,authenticated using(true);
drop policy if exists repository_fb_admin_update on public.repository_fb_pixels;
create policy repository_fb_admin_update on public.repository_fb_pixels for update to authenticated
using((select public.x_loan_is_admin())) with check((select public.x_loan_is_admin()));

-- Run-once seed: later re-runs cannot overwrite an administrator's edits.
insert into public.repository_fb_pixels(site_id,variant,pixel_ids)
select s.site_id,v.variant,
  case when (s.site_id='main' and v.variant in ('E','F','G'))
         or (s.site_id='copy1' and v.variant in ('C','J')) then
    coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'enabled',q.enabled) order by q.ord)
      from (select distinct on (p->>'id') p->>'id' id, coalesce((p->>'enabled')::boolean,true) enabled, ord
        from public.site_settings ss, jsonb_array_elements(ss.pixel_ids) with ordinality arr(p,ord)
        where ss.id=1 and p->>'variant'=v.variant and coalesce(p->>'platform','facebook') not ilike '%tiktok%'
        and p->>'id' ~ '^[0-9]{8,20}$' order by p->>'id',ord limit 5) q),'[]'::jsonb)
  else '[]'::jsonb end
from (values('main'),('copy1'),('copy2')) s(site_id)
cross join (values('C'),('E'),('F'),('G'),('I'),('J'),('K')) v(variant)
where s.site_id='main' or v.variant<>'G'
on conflict(site_id,variant) do nothing;
notify pgrst,'reload schema';
commit;
select site_id,variant,jsonb_array_length(pixel_ids) as pixel_count
from public.repository_fb_pixels order by site_id,variant;
