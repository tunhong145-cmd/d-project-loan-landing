-- K module: additive migration only. Existing leads/site_settings are untouched.
begin;
create table if not exists public.x_loan_settings (
  version_code text primary key check (version_code = 'K'),
  line_url text not null default '',
  line_id text not null default '',
  pixel_ids jsonb not null default '[]'::jsonb
    check (jsonb_typeof(pixel_ids) = 'array' and jsonb_array_length(pixel_ids) <= 5),
  client_copy_next_number integer not null default 1 check (client_copy_next_number between 1 and 999999),
  updated_at timestamptz not null default now(),
  check (line_url = '' or line_url ~ '^https://(lin\.ee|line\.me)/[^[:space:]]+$')
);
insert into public.x_loan_settings(version_code) values ('K') on conflict do nothing;

create table if not exists public.x_loan_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null check (length(trim(name)) between 1 and 80),
  age integer not null check (age between 18 and 100),
  phone text not null check (length(trim(phone)) > 0),
  q3_amount_needed text not null check (length(q3_amount_needed) between 1 and 80),
  q2_bank_status text not null check (q2_bank_status = '否'),
  court_deduction_status text not null check (court_deduction_status in ('是','否')),
  has_passport text not null check (has_passport in ('是','否')),
  q4_foreign_currency_account text not null check (q4_foreign_currency_account in ('是','否')),
  project_code text not null default 'X貸款' check (project_code = 'X貸款'),
  landing_version text not null default 'K版本' check (landing_version = 'K版本'),
  source_url text,
  traffic_source text,
  user_agent text,
  line_clicked boolean not null default false,
  status text not null default 'new' check (status in ('new','contacted','line_added','approved','rejected','invalid')),
  notes text not null default '',
  client_copy_number integer check (client_copy_number between 1 and 999999),
  search_text text generated always as (lower(name || ' ' || phone || ' ' || age::text || ' ' || q3_amount_needed || ' ' || coalesce(source_url,''))) stored
);
create index if not exists x_loan_leads_created_idx on public.x_loan_leads(created_at desc,id desc);
create index if not exists x_loan_leads_status_idx on public.x_loan_leads(status);

create or replace function public.x_loan_is_admin()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt()->>'email','') = 'admin@d-project.local';
$$;
revoke all on function public.x_loan_is_admin() from public;
grant execute on function public.x_loan_is_admin() to authenticated;
alter table public.x_loan_leads enable row level security;
alter table public.x_loan_settings enable row level security;
revoke all on public.x_loan_leads, public.x_loan_settings from anon, authenticated;
grant select,update,delete on public.x_loan_leads to authenticated;
grant select,update on public.x_loan_settings to authenticated;
drop policy if exists x_loan_admin on public.x_loan_leads;
create policy x_loan_admin on public.x_loan_leads for all to authenticated
  using ((select public.x_loan_is_admin())) with check ((select public.x_loan_is_admin()));
drop policy if exists x_loan_settings_admin on public.x_loan_settings;
create policy x_loan_settings_admin on public.x_loan_settings for all to authenticated
  using ((select public.x_loan_is_admin())) with check ((select public.x_loan_is_admin()));

-- Public config exposes only routing/tracking values, never counters or orders.
create or replace function public.get_x_loan_k_config()
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('line_url',line_url,'line_id',line_id,'pixel_ids',pixel_ids)
  from public.x_loan_settings where version_code='K';
$$;

-- Public submissions cannot supply status, timestamps, notes or copy numbers.
create or replace function public.submit_x_loan_k_lead(payload jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare new_id uuid := (payload->>'id')::uuid;
begin
  if not exists(select 1 from public.x_loan_settings where version_code='K' and line_url <> '') then
    raise exception 'K_LINE_NOT_CONFIGURED';
  end if;
  if new_id is null then raise exception 'MISSING_LEAD_ID'; end if;
  insert into public.x_loan_leads(id,name,age,phone,q3_amount_needed,q2_bank_status,
    court_deduction_status,has_passport,q4_foreign_currency_account,source_url,traffic_source,user_agent)
  values (new_id,trim(payload->>'name'),(payload->>'age')::integer,trim(payload->>'phone'),
    payload->>'q3_amount_needed',payload->>'q2_bank_status',payload->>'court_deduction_status',
    payload->>'has_passport',payload->>'q4_foreign_currency_account',
    left(payload->>'source_url',4096),left(payload->>'traffic_source',40),left(payload->>'user_agent',1000));
  return new_id;
end;
$$;
create or replace function public.mark_x_loan_line_clicked(lead_id uuid)
returns void language sql security definer set search_path = '' as $$
  update public.x_loan_leads set line_clicked=true,updated_at=now() where id=lead_id;
$$;

-- Row locks serialize allocations from multiple computers. Existing assignments are reused.
create or replace function public.assign_x_loan_copy_number(target_lead_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare saved_number integer; next_number integer;
begin
  if not public.x_loan_is_admin() then raise exception 'ACCESS_DENIED'; end if;
  select client_copy_next_number into next_number from public.x_loan_settings where version_code='K' for update;
  select client_copy_number into saved_number from public.x_loan_leads where id=target_lead_id for update;
  if not found then raise exception 'LEAD_NOT_FOUND'; end if;
  if saved_number is null then
    if next_number >= 999999 then raise exception 'NUMBER_LIMIT_REACHED'; end if;
    saved_number := next_number;
    update public.x_loan_leads set client_copy_number=saved_number,updated_at=now() where id=target_lead_id;
    update public.x_loan_settings set client_copy_next_number=next_number+1,updated_at=now() where version_code='K';
    next_number := next_number+1;
  end if;
  return jsonb_build_object('number',saved_number,'next_number',next_number);
end;
$$;
revoke all on function public.get_x_loan_k_config(), public.submit_x_loan_k_lead(jsonb), public.mark_x_loan_line_clicked(uuid), public.assign_x_loan_copy_number(uuid) from public;
grant execute on function public.get_x_loan_k_config(), public.submit_x_loan_k_lead(jsonb), public.mark_x_loan_line_clicked(uuid) to anon,authenticated;
grant execute on function public.assign_x_loan_copy_number(uuid) to authenticated;
notify pgrst,'reload schema';
commit;
select 'K module ready' as result, (select count(*) from public.x_loan_leads) as k_orders,
  (select count(*) from public.leads) as existing_orders,
  (select md5(row_to_json(s)::text) from public.site_settings s where id=1) as original_settings_fingerprint;
