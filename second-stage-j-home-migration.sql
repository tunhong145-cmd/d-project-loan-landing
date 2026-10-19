-- Additive migration for routing new J-version submissions to the second-stage queue.
-- Existing leads and x_loan_leads rows are retained as-is.

begin;

-- Allow the isolated second-stage table to identify both J and K submissions.
alter table public.x_loan_leads
  drop constraint if exists x_loan_leads_landing_version_check;
alter table public.x_loan_leads
  add constraint x_loan_leads_landing_version_check
  check (landing_version in ('J版本', 'K版本'));

-- Preserve device metadata that the existing J intake already collects.
alter table public.x_loan_leads
  add column if not exists ip_address text,
  add column if not exists device_type text,
  add column if not exists browser_name text;

-- Keep the shared second-stage counter ahead of both prior numbering sequences.
update public.x_loan_settings s
set client_copy_next_number = least(999999, greatest(
  s.client_copy_next_number,
  coalesce((select max(l.client_copy_number) + 1 from public.x_loan_leads l), 1),
  coalesce((select max(g.client_copy_number) + 1 from public.leads g), 1),
  coalesce((select max(greatest(coalesce(ss.client_copy_next_number,1),1)) from public.site_settings ss), 1)
)), updated_at = now()
where s.version_code = 'K';

-- Public J intake is intentionally separate from the legacy leads table.
-- The J page keeps its existing site_settings LINE and repository Pixel config.
create or replace function public.submit_x_loan_j_lead(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  new_id uuid := nullif(payload->>'id','')::uuid;
  full_name text := nullif(trim(payload->>'name'),'');
  raw_age text := nullif(trim(payload->>'age'),'');
  phone_value text := nullif(trim(payload->>'phone'),'');
  amount_value text := nullif(trim(payload->>'q3_amount_needed'),'');
  warning_value text := nullif(trim(payload->>'q2_bank_status'),'');
  age_value integer;
begin
  if new_id is null then raise exception 'MISSING_LEAD_ID'; end if;
  if full_name is null then raise exception 'MISSING_NAME'; end if;
  if raw_age is null or raw_age !~ '^[0-9]{1,3}$' then raise exception 'INVALID_AGE'; end if;
  age_value := raw_age::integer;
  if age_value < 18 or age_value > 100 then raise exception 'INVALID_AGE'; end if;
  if phone_value is null then raise exception 'MISSING_PHONE'; end if;
  if amount_value is null then raise exception 'MISSING_AMOUNT'; end if;
  if warning_value is null or warning_value not in ('非警示戶','否') then raise exception 'INELIGIBLE_WARNING_STATUS'; end if;

  insert into public.x_loan_leads(
    id,name,age,phone,q3_amount_needed,q2_bank_status,project_code,landing_version,
    source_url,traffic_source,user_agent,ip_address,device_type,browser_name
  ) values (
    new_id,full_name,age_value,phone_value,amount_value,'否','X貸款','J版本',
    left(payload->>'source_url',4096),left(payload->>'traffic_source',40),
    left(payload->>'user_agent',1000),left(payload->>'ip_address',80),
    left(payload->>'device_type',80),left(payload->>'browser_name',80)
  );
  return new_id;
end;
$$;

create or replace function public.mark_x_loan_line_clicked(lead_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.x_loan_leads set line_clicked=true,updated_at=now() where id=lead_id;
$$;

revoke all on function public.submit_x_loan_j_lead(jsonb), public.mark_x_loan_line_clicked(uuid) from public;
grant execute on function public.submit_x_loan_j_lead(jsonb), public.mark_x_loan_line_clicked(uuid) to anon,authenticated;

-- Read-only dashboard aggregation: fetch counts only, never customer rows.
create or replace function public.get_admin_home_overview(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null
) returns jsonb language sql stable security invoker set search_path = public as $$
  with all_orders as (
    select
      case when business_type = 'subsidy' then '補助'
           else coalesce(nullif(resolved_landing_variant,''),nullif(landing_variant,''),'C') end as version_key,
      '申請列表'::text as queue_key, status, created_at
    from public.leads
    where coalesce(resolved_landing_variant,'') <> 'H'
      and (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at < p_date_to)
    union all
    select case when landing_version = 'J版本' then 'J' else 'K' end,
      '二篩'::text, status, created_at
    from public.x_loan_leads
    where (p_date_from is null or created_at >= p_date_from)
      and (p_date_to is null or created_at < p_date_to)
  ), grouped as (
    select version_key, queue_key, count(*) as total,
      count(*) filter (where status='new') as new_count,
      count(*) filter (where status='contacted') as contacted,
      count(*) filter (where status='line_added') as line_added,
      count(*) filter (where status='approved') as approved,
      count(*) filter (where status in ('rejected','invalid')) as invalid
    from all_orders group by version_key, queue_key
  ), totals as (
    select count(*) as total,
      count(*) filter (where status='new') as new_count,
      count(*) filter (where status='contacted') as contacted,
      count(*) filter (where status='line_added') as line_added,
      count(*) filter (where status='approved') as approved,
      count(*) filter (where status in ('rejected','invalid')) as invalid
    from all_orders
  )
  select jsonb_build_object(
    'totals',(select to_jsonb(totals) from totals),
    'versions',coalesce((select jsonb_agg(to_jsonb(grouped) order by
      case version_key when 'C' then 1 when 'E' then 2 when 'F' then 3 when 'G' then 4
        when 'I' then 5 when 'J' then 6 when 'K' then 7 when '補助' then 8 else 9 end, queue_key)
      from grouped),'[]'::jsonb)
  );
$$;

revoke all on function public.get_admin_home_overview(timestamptz,timestamptz) from public;
grant execute on function public.get_admin_home_overview(timestamptz,timestamptz) to authenticated;

create or replace function public.get_second_stage_stats(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_version text default null
) returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'total',count(*),
    'new',count(*) filter (where status='new'),
    'contacted',count(*) filter (where status='contacted'),
    'line_added',count(*) filter (where status='line_added'),
    'approved',count(*) filter (where status='approved'),
    'invalid',count(*) filter (where status in ('rejected','invalid'))
  ) from public.x_loan_leads
  where (p_date_from is null or created_at >= p_date_from)
    and (p_date_to is null or created_at <= p_date_to)
    and (p_version is null or landing_version = p_version);
$$;

revoke all on function public.get_second_stage_stats(timestamptz,timestamptz,text) from public;
grant execute on function public.get_second_stage_stats(timestamptz,timestamptz,text) to authenticated;

commit;
