-- Additive, read-only functions. No orders, counters or settings are changed.
begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
create or replace function public.get_recent_intake_dashboard()
returns jsonb language sql stable security invoker set search_path='' as $$
with bounds as (select now() as until, now()-interval '30 minutes' as since),
orders as materialized (
 select l.id,l.created_at,
 case when l.business_type='subsidy' then '補助'
 else coalesce(nullif(l.resolved_landing_variant,''),nullif(l.landing_variant,''),'C') end as version,
 'main'::text as queue
 from public.leads l,bounds b
 where l.created_at>=b.since and l.created_at<=b.until and coalesce(l.resolved_landing_variant,'')<>'H'
 union all
 select l.id,l.created_at,replace(l.landing_version,'版本',''),'second'
 from public.x_loan_leads l,bounds b where l.created_at>=b.since and l.created_at<=b.until
), ranked as (
 select version,count(*) as total,count(*) filter(where queue='main') as main,
 count(*) filter(where queue='second') as second,max(created_at) as latest
 from orders group by version
), recent as (select * from orders order by created_at desc,id desc limit 10)
select jsonb_build_object('from',(select since from bounds),'to',(select until from bounds),
 'total',(select count(*) from orders),'main',(select count(*) from orders where queue='main'),
 'second',(select count(*) from orders where queue='second'),
 'versions',coalesce((select jsonb_agg(to_jsonb(r) order by r.total desc,r.latest desc,r.version) from ranked r),'[]'::jsonb),
 'recent',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc,r.id desc) from recent r),'[]'::jsonb));
$$;
revoke all on function public.get_recent_intake_dashboard() from public,anon;
grant execute on function public.get_recent_intake_dashboard() to authenticated;
create or replace function public.get_second_stage_filtered_stats(
 p_date_from timestamptz default null,p_date_to timestamptz default null,
 p_versions text[] default null,p_status text default null,p_source text default null,p_search text default null
) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('total',count(*),'new',count(*) filter(where status='new'),
 'contacted',count(*) filter(where status='contacted'),'line_added',count(*) filter(where status='line_added'),
 'approved',count(*) filter(where status='approved'),'invalid',count(*) filter(where status in ('invalid','rejected')))
 from public.x_loan_leads
 where (p_date_from is null or created_at>=p_date_from)
 and (p_date_to is null or created_at<=p_date_to)
 and (coalesce(cardinality(p_versions),0)=0 or landing_version=any(p_versions))
 and (coalesce(p_status,'')='' or status=p_status)
 and (coalesce(p_source,'')='' or (p_source='unknown' and coalesce(traffic_source,'')='') or (p_source<>'unknown' and traffic_source=p_source))
 and (coalesce(trim(p_search),'')='' or search_text ilike '%'||replace(replace(replace(trim(p_search),chr(92),chr(92)||chr(92)),'%',chr(92)||'%'),'_',chr(92)||'_')||'%' escape E'\\');
$$;
revoke all on function public.get_second_stage_filtered_stats(timestamptz,timestamptz,text[],text,text,text) from public,anon;
grant execute on function public.get_second_stage_filtered_stats(timestamptz,timestamptz,text[],text,text,text) to authenticated;
commit;
