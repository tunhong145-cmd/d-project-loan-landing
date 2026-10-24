-- New submissions only. No existing order/counter/config values are updated.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';

create table public.order_routing_settings (
 id integer primary key check(id=1),
 routes jsonb not null,
 revision integer not null default 1,
 updated_at timestamptz not null default now(),
 updated_by uuid
);
insert into public.order_routing_settings(id,routes) values
 (1,'{"C":"main","E":"second","F":"main","G":"main","I":"main","J":"second","K":"second"}');
alter table public.order_routing_settings enable row level security;
revoke all on public.order_routing_settings from public,anon,authenticated;

create function public.get_order_routing_settings()
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if public.is_d_main_admin() is not true then raise exception 'ACCESS_DENIED'; end if;
 return (select jsonb_build_object('routes',routes,'revision',revision,'updated_at',updated_at)
 from public.order_routing_settings where id=1);
end; $$;

create function public.save_order_routing_settings(p_routes jsonb,p_revision integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare old_revision integer; v text;
begin
 if public.is_d_main_admin() is not true then raise exception 'ACCESS_DENIED'; end if;
 if p_routes is null or jsonb_typeof(p_routes)<>'object' then raise exception 'INVALID_ROUTES'; end if;
 if (select count(*) from jsonb_object_keys(p_routes))<>7 then raise exception 'INVALID_ROUTES'; end if;
 foreach v in array array['C','E','F','G','I','J','K'] loop
  if coalesce(p_routes->>v,'') not in ('main','second') then raise exception 'INVALID_ROUTES'; end if;
 end loop;
 select revision into old_revision from public.order_routing_settings where id=1 for update;
 if p_revision is distinct from old_revision then raise exception 'ROUTING_CHANGED_RELOAD'; end if;
 update public.order_routing_settings set routes=p_routes,revision=revision+1,
 updated_at=clock_timestamp(),updated_by=auth.uid() where id=1 and routes is distinct from p_routes;
 return public.get_order_routing_settings();
end; $$;
revoke all on function public.get_order_routing_settings(),public.save_order_routing_settings(jsonb,integer) from public,anon;
grant execute on function public.get_order_routing_settings(),public.save_order_routing_settings(jsonb,integer) to authenticated;

alter table public.leads add column intake_queue_origin text;
alter table public.x_loan_leads add column intake_queue_origin text;
alter table public.x_loan_leads drop constraint x_loan_leads_landing_version_check;
alter table public.x_loan_leads add constraint x_loan_leads_landing_version_check check
 (landing_version in ('C版本','E版本','F版本','G版本','I版本','J版本','K版本'));
-- Preserve C/F/G/I legacy forms' accepted values; E/J/K rules remain unchanged.
alter table public.x_loan_leads drop constraint x_loan_leads_age_check;
alter table public.x_loan_leads add constraint x_loan_leads_age_check check
 (case when landing_version in ('C版本','F版本','G版本','I版本') then age between 1 and 120 else age between 18 and 100 end);
alter table public.x_loan_leads drop constraint x_loan_leads_phone_check;
alter table public.x_loan_leads add constraint x_loan_leads_phone_check check
 (landing_version in ('C版本','F版本','G版本','I版本') or length(trim(phone))>0);
alter table public.x_loan_leads drop constraint x_loan_leads_name_check;
alter table public.x_loan_leads add constraint x_loan_leads_name_check check
 (length(trim(name))>0 and (landing_version in ('C版本','F版本','G版本','I版本') or length(trim(name))<=80));

create function public.route_new_loan_order()
returns trigger language plpgsql security definer set search_path='' as $$
declare v text; target_queue text;
begin
 -- The nested insert is the destination, not another routing decision.
 if pg_trigger_depth()>1 then return new; end if;
 if tg_table_name='leads' then
  if coalesce(new.business_type,'loan')<>'loan' then return new; end if;
  v:=upper(trim(coalesce(new.landing_variant,'')));
 else v:=replace(new.landing_version,'版本','');
 end if;
 if v not in ('C','E','F','G','I','J','K') then return new; end if;
 -- Serialize retries of one UUID across both destinations, including a route change.
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.id::text,20261024));
 if exists(select 1 from public.leads l where l.id=new.id)
  or exists(select 1 from public.x_loan_leads l where l.id=new.id) then
  raise exception 'LEAD_ID_ALREADY_EXISTS' using errcode='23505';
 end if;
 select routes->>v into target_queue from public.order_routing_settings where id=1;
 if target_queue is null then return new; end if;
 if tg_table_name='leads' and target_queue='second' then
  if new.q2_bank_status not in ('否','非警示戶') or new.q2_bank_status is null then
   raise exception 'INELIGIBLE_WARNING_STATUS';
  end if;
  insert into public.x_loan_leads(id,created_at,updated_at,name,age,phone,q3_amount_needed,
   q2_bank_status,q4_foreign_currency_account,landing_version,source_url,traffic_source,
   user_agent,ip_address,device_type,browser_name,line_clicked,status,notes,client_copy_number,intake_queue_origin)
  values(new.id,new.created_at,coalesce(new.updated_at,new.created_at),new.name,new.age::integer,coalesce(new.phone,''),
   new.q3_amount_needed,'否',null,v||'版本',new.source_url,new.traffic_source,new.user_agent,
   new.ip_address,new.device_type,new.browser_name,coalesce(new.line_clicked,false),coalesce(new.status,'new'),coalesce(new.notes,''),new.client_copy_number,'main');
  return null;
 elsif tg_table_name='x_loan_leads' and target_queue='main' then
  -- BEFORE INSERT runs before constraints; preserve original E/J/K validation.
  if new.age not between 18 and 100 or new.age is null or length(trim(coalesce(new.name,''))) not between 1 and 80
   or trim(coalesce(new.phone,''))='' or length(coalesce(new.q3_amount_needed,'')) not between 1 and 80
   or new.q2_bank_status is distinct from '否' then raise exception 'INVALID_LEAD'; end if;
  insert into public.leads(id,created_at,updated_at,name,age,phone,q3_amount_needed,q2_bank_status,
   q4_foreign_currency_account,business_type,landing_variant,source_url,traffic_source,user_agent,
   ip_address,device_type,browser_name,line_clicked,status,notes,client_copy_number,intake_queue_origin)
  values(new.id,new.created_at,new.updated_at,new.name,new.age::text,new.phone,new.q3_amount_needed,'否',
   coalesce(new.q4_foreign_currency_account,''),'loan',v,new.source_url,new.traffic_source,new.user_agent,
   new.ip_address,new.device_type,new.browser_name,new.line_clicked,new.status,new.notes,new.client_copy_number,'second');
  return null;
 end if;
 return new;
end; $$;
revoke all on function public.route_new_loan_order() from public,anon,authenticated;
create trigger a_route_new_loan_order before insert on public.leads for each row execute function public.route_new_loan_order();
create trigger a_route_new_loan_order before insert on public.x_loan_leads for each row execute function public.route_new_loan_order();

create or replace function public.mark_line_clicked(lead_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.leads set line_clicked=true where id=lead_id;
 if not found then update public.x_loan_leads set line_clicked=true,updated_at=now()
  where id=lead_id and intake_queue_origin='main'; end if;
end; $$;
create or replace function public.mark_x_loan_line_clicked(lead_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 update public.x_loan_leads set line_clicked=true,updated_at=now() where id=lead_id;
 if not found then update public.leads set line_clicked=true where id=lead_id and intake_queue_origin='second'; end if;
end; $$;
revoke all on function public.mark_line_clicked(uuid),public.mark_x_loan_line_clicked(uuid) from public;
grant execute on function public.mark_line_clicked(uuid),public.mark_x_loan_line_clicked(uuid) to anon,authenticated;

-- Extend only the version mapping in existing functions, preserve other logic.
do $migration$
declare d text;
begin
 d:=pg_get_functiondef('public.set_lead_admin_metadata()'::regprocedure);
 if position('''C'',''E'',''F'',''G'',''H'',''I'',''J''' in d)=0 then raise exception 'UNEXPECTED_VERSION_RESOLVER'; end if;
 execute replace(d,'''C'',''E'',''F'',''G'',''H'',''I'',''J''','''C'',''E'',''F'',''G'',''H'',''I'',''J'',''K''');
 d:=pg_get_functiondef('public.get_admin_home_overview(timestamptz,timestamptz)'::regprocedure);
 if position('case landing_version when ''E版本'' then ''E'' when ''J版本'' then ''J'' else ''K'' end' in d)=0 then raise exception 'UNEXPECTED_OVERVIEW'; end if;
 execute replace(d,'case landing_version when ''E版本'' then ''E'' when ''J版本'' then ''J'' else ''K'' end','replace(landing_version,''版本'','''')');
end; $migration$;
commit;
