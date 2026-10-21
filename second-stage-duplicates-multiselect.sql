-- Read-only duplicate metadata. No order rows or numbering are rewritten.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.normalize_second_stage_name(value text)
returns text language sql immutable parallel safe set search_path='' as $$
  select lower(regexp_replace(trim(coalesce(value,'')), '[[:space:]　]+', '', 'g'));
$$;
create or replace function public.normalize_second_stage_phone(value text)
returns text language sql immutable parallel safe set search_path='' as $$
  select lower(regexp_replace(
    translate(coalesce(value,''),'０１２３４５６７８９＋－（）','0123456789+-()'),
    '[[:space:]　()\-]+','','g'));
$$;
create index if not exists x_loan_dup_name_order_idx
  on public.x_loan_leads(public.normalize_second_stage_name(name),created_at,id);
create index if not exists x_loan_dup_phone_order_idx
  on public.x_loan_leads(public.normalize_second_stage_phone(phone),created_at,id);

-- security_invoker preserves the base table's RLS and operator restrictions.
create or replace view public.x_loan_leads_admin
with (security_invoker=true) as
select l.*,
  (
    (public.normalize_second_stage_name(l.name)<>'' and exists(
      select 1 from public.x_loan_leads p
      where public.normalize_second_stage_name(p.name)=public.normalize_second_stage_name(l.name)
        and (p.created_at,p.id)<(l.created_at,l.id)))
    or
    (public.normalize_second_stage_phone(l.phone)<>'' and exists(
      select 1 from public.x_loan_leads p
      where public.normalize_second_stage_phone(p.phone)=public.normalize_second_stage_phone(l.phone)
        and (p.created_at,p.id)<(l.created_at,l.id)))
  ) as is_duplicate
from public.x_loan_leads l;
revoke all on public.x_loan_leads_admin from public,anon;
grant select on public.x_loan_leads_admin to authenticated;

create or replace function public.get_second_stage_stats_multi(
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_versions text[] default null
) returns jsonb language sql stable security invoker set search_path='' as $$
  select jsonb_build_object(
    'total',count(*),
    'new',count(*) filter(where status='new'),
    'contacted',count(*) filter(where status='contacted'),
    'line_added',count(*) filter(where status='line_added'),
    'approved',count(*) filter(where status='approved'),
    'invalid',count(*) filter(where status in ('rejected','invalid'))
  ) from public.x_loan_leads
  where (p_date_from is null or created_at>=p_date_from)
    and (p_date_to is null or created_at<=p_date_to)
    and (coalesce(cardinality(p_versions),0)=0 or landing_version=any(p_versions));
$$;
revoke all on function public.get_second_stage_stats_multi(timestamptz,timestamptz,text[]) from public;
grant execute on function public.get_second_stage_stats_multi(timestamptz,timestamptz,text[]) to authenticated;
commit;
