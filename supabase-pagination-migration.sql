-- D project admin pagination/search migration. Safe to rerun.

create or replace function public.normalize_lead_name(value text)
returns text language sql immutable set search_path = public as $$
  select lower(regexp_replace(trim(coalesce(value, '')), '\s+', '', 'g'));
$$;

create or replace function public.normalize_lead_phone(value text)
returns text language sql immutable set search_path = public as $$
  with cleaned as (select regexp_replace(coalesce(value, ''), '\D', '', 'g') as digits)
  select case when digits like '8869%' then '0' || substring(digits from 4) else digits end from cleaned;
$$;

create or replace function public.extract_lead_source_ad(value text)
returns text language sql immutable set search_path = public as $$
  select nullif((regexp_match(coalesce(value, ''), '[?&](?:ad_name|utm_content)=([^&#]*)'))[1], '');
$$;

alter table public.leads
  add column if not exists is_duplicate boolean not null default false,
  add column if not exists duplicate_of_id uuid,
  add column if not exists source_ad text,
  add column if not exists resolved_landing_variant text,
  add column if not exists resolved_traffic_source text,
  add column if not exists search_text text;

create extension if not exists pg_trgm;

-- Backfill only helper fields; original customer data stays unchanged.
update public.leads
set
  source_ad = public.extract_lead_source_ad(source_url),
  resolved_landing_variant = case
    when upper(trim(coalesce(landing_variant, ''))) in ('C','E','F','G','H','I','J') then upper(trim(landing_variant))
    when lower(coalesce(source_url, '')) ~ '/j(?:/|$|\?)' then 'J'
    when lower(coalesce(source_url, '')) ~ '/i(?:/|$|\?)' then 'I'
    when lower(coalesce(source_url, '')) ~ '/h(?:/|$|\?)' then 'H'
    when lower(coalesce(source_url, '')) ~ '/g(?:/|$|\?)' then 'G'
    when lower(coalesce(source_url, '')) ~ '/f(?:/|$|\?)' then 'F'
    when lower(coalesce(source_url, '')) ~ '/e(?:/|$|\?)' then 'E'
    when coalesce(source_url, '') <> '' then 'C'
    else null
  end,
  resolved_traffic_source = case
    when lower(trim(coalesce(traffic_source, ''))) in ('fb','facebook','meta') then 'FB'
    when lower(trim(coalesce(traffic_source, ''))) in ('tiktok','tk') then 'TikTok'
    when lower(coalesce(source_url, '')) like '%fbclid=%'
      or lower(coalesce(source_url, '')) ~ 'utm_source=(facebook|fb|meta)'
      or lower(coalesce(source_url, '')) ~ 'site_source_name=(fb|ig|msg|an)' then 'FB'
    when lower(coalesce(source_url, '')) like '%ttclid=%'
      or lower(coalesce(source_url, '')) ~ 'utm_source=(tiktok|tk)' then 'TikTok'
    else null
  end,
  search_text = lower(concat_ws(' ', name, age, phone, line_id, q3_amount_needed,
    q2_bank_status, city, id_number, public.extract_lead_source_ad(source_url), source_url))
where search_text is null;

-- Calculate global duplicate status in one windowed pass. H stays separate.
update public.leads
set duplicate_of_id = null, is_duplicate = false;

with eligible as (
  select id, created_at, public.normalize_lead_name(name) as normalized_name,
    public.normalize_lead_phone(phone) as normalized_phone
  from public.leads where coalesce(resolved_landing_variant, '') <> 'H'
), key_rows as (
  select id as lead_id, created_at, 'name'::text as key_type, normalized_name as key_value
  from eligible where normalized_name <> ''
  union all
  select id, created_at, 'phone'::text, normalized_phone
  from eligible where normalized_phone <> ''
), first_matches as (
  select lead_id,
    first_value(lead_id) over (partition by key_type, key_value order by created_at, lead_id
      rows between unbounded preceding and 1 preceding) as first_id,
    first_value(created_at) over (partition by key_type, key_value order by created_at, lead_id
      rows between unbounded preceding and 1 preceding) as first_created_at
  from key_rows
), chosen as (
  select distinct on (lead_id) lead_id, first_id
  from first_matches where first_id is not null
  order by lead_id, first_created_at, first_id
)
update public.leads lead
set duplicate_of_id = chosen.first_id, is_duplicate = true
from chosen where lead.id = chosen.lead_id;

update public.leads set duplicate_of_id = null, is_duplicate = false
where coalesce(resolved_landing_variant, '') = 'H';

create index if not exists leads_created_at_id_idx on public.leads (created_at desc, id desc);
create index if not exists leads_status_idx on public.leads (status);
create index if not exists leads_resolved_variant_idx on public.leads (resolved_landing_variant);
create index if not exists leads_resolved_source_idx on public.leads (resolved_traffic_source);
create index if not exists leads_source_ad_idx on public.leads (source_ad);
create index if not exists leads_base_duplicate_idx on public.leads (base_duplicate);
create index if not exists leads_normalized_name_idx on public.leads ((public.normalize_lead_name(name)))
  where public.normalize_lead_name(name) <> '';
create index if not exists leads_normalized_phone_idx on public.leads ((public.normalize_lead_phone(phone)))
  where public.normalize_lead_phone(phone) <> '';
create index if not exists leads_search_text_trgm_idx on public.leads using gin (search_text gin_trgm_ops);

create or replace function public.set_lead_admin_metadata()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  first_match_id uuid;
  normalized_name text := public.normalize_lead_name(new.name);
  normalized_phone text := public.normalize_lead_phone(new.phone);
  source_url_lower text := lower(coalesce(new.source_url, ''));
  saved_source text := lower(trim(coalesce(new.traffic_source, '')));
begin
  new.source_ad := public.extract_lead_source_ad(new.source_url);
  new.resolved_landing_variant := case
    when upper(trim(coalesce(new.landing_variant, ''))) in ('C','E','F','G','H','I','J') then upper(trim(new.landing_variant))
    when source_url_lower ~ '/j(?:/|$|\?)' then 'J'
    when source_url_lower ~ '/i(?:/|$|\?)' then 'I'
    when source_url_lower ~ '/h(?:/|$|\?)' then 'H'
    when source_url_lower ~ '/g(?:/|$|\?)' then 'G'
    when source_url_lower ~ '/f(?:/|$|\?)' then 'F'
    when source_url_lower ~ '/e(?:/|$|\?)' then 'E'
    when coalesce(new.source_url, '') <> '' then 'C'
    else null end;
  new.resolved_traffic_source := case
    when saved_source in ('fb','facebook','meta') then 'FB'
    when saved_source in ('tiktok','tk') then 'TikTok'
    when source_url_lower like '%fbclid=%'
      or source_url_lower ~ 'utm_source=(facebook|fb|meta)'
      or source_url_lower ~ 'site_source_name=(fb|ig|msg|an)' then 'FB'
    when source_url_lower like '%ttclid=%' or source_url_lower ~ 'utm_source=(tiktok|tk)' then 'TikTok'
    else null end;
  if coalesce(new.resolved_landing_variant, '') <> 'H' then
    select lead.id into first_match_id from public.leads lead
    where lead.id <> new.id and coalesce(lead.resolved_landing_variant, '') <> 'H'
      and ((normalized_name <> '' and public.normalize_lead_name(lead.name) = normalized_name)
        or (normalized_phone <> '' and public.normalize_lead_phone(lead.phone) = normalized_phone))
      and (lead.created_at < coalesce(new.created_at, now())
        or (lead.created_at = coalesce(new.created_at, now()) and lead.id::text < new.id::text))
    order by lead.created_at, lead.id limit 1;
  end if;
  new.duplicate_of_id := first_match_id;
  new.is_duplicate := first_match_id is not null;
  new.search_text := lower(concat_ws(' ', new.name, new.age, new.phone, new.line_id,
    new.q3_amount_needed, new.q2_bank_status, new.city, new.id_number, new.source_ad, new.source_url));
  return new;
end;
$$;

drop trigger if exists set_lead_admin_metadata_trigger on public.leads;
create trigger set_lead_admin_metadata_trigger
before insert or update of name, age, phone, line_id, q3_amount_needed,
  q2_bank_status, city, id_number, source_url, traffic_source, landing_variant
on public.leads for each row execute function public.set_lead_admin_metadata();

create or replace function public.get_admin_lead_stats(
  p_status text default null, p_business_type text default null,
  p_variants text[] default null, p_base_duplicate text default null,
  p_traffic_source text default null, p_search text default null,
  p_date_from timestamptz default null, p_date_to timestamptz default null
) returns jsonb language sql stable security invoker set search_path = public as $$
  with filtered as (
    select status, created_at from public.leads
    where coalesce(resolved_landing_variant, '') <> 'H'
      and (p_status is null or p_status = '' or status = p_status)
      and (p_business_type is null or p_business_type = ''
        or (p_business_type = 'loan' and coalesce(business_type, 'loan') = 'loan')
        or (p_business_type = 'subsidy' and business_type = 'subsidy'))
      and (p_variants is null or cardinality(p_variants) = 0 or resolved_landing_variant = any(p_variants))
      and (p_base_duplicate is null or p_base_duplicate = ''
        or (p_base_duplicate = 'yes' and base_duplicate is true)
        or (p_base_duplicate = 'no' and coalesce(base_duplicate, false) is false))
      and (p_traffic_source is null or p_traffic_source = ''
        or (p_traffic_source = 'unknown' and resolved_traffic_source is null)
        or resolved_traffic_source = p_traffic_source)
      and (p_search is null or p_search = '' or search_text ilike '%' || lower(p_search) || '%')
      and (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at <= p_date_to)
  )
  select jsonb_build_object(
    'filtered', count(*),
    'today', count(*) filter (where created_at >= date_trunc('day', now() at time zone 'Asia/Taipei') at time zone 'Asia/Taipei'),
    'new', count(*) filter (where status = 'new'),
    'contacted', count(*) filter (where status = 'contacted'),
    'line_added', count(*) filter (where status = 'line_added'),
    'approved', count(*) filter (where status = 'approved'),
    'invalid', count(*) filter (where status = 'invalid')) from filtered;
$$;

grant execute on function public.get_admin_lead_stats(text, text, text[], text, text, text, timestamptz, timestamptz) to authenticated;

select count(*) as total_orders,
  count(*) filter (where is_duplicate) as duplicate_orders,
  count(*) filter (where source_ad is not null) as orders_with_source_ad,
  count(*) filter (where search_text is null) as missing_search_rows
from public.leads;
