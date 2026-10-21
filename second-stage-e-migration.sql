-- Add E intake only. No existing orders, settings or counters are updated.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '20s';

alter table public.x_loan_leads
  drop constraint if exists x_loan_leads_landing_version_check;
alter table public.x_loan_leads
  add constraint x_loan_leads_landing_version_check
  check (landing_version in ('E版本','J版本','K版本'));

-- Reuse the currently deployed J intake validation, retaining its exact contract.
do $migration$
declare definition text;
begin
  definition := pg_get_functiondef('public.submit_x_loan_j_lead(jsonb)'::regprocedure);
  if position('''J版本''' in definition) = 0 then
    raise exception 'Unexpected J intake definition; aborting';
  end if;
  definition := replace(definition, 'public.submit_x_loan_j_lead(', 'public.submit_x_loan_e_lead(');
  definition := replace(definition, '''J版本''', '''E版本''');
  execute definition;

  definition := pg_get_functiondef('public.get_admin_home_overview(timestamptz,timestamptz)'::regprocedure);
  if position('case when landing_version = ''J版本'' then ''J'' else ''K'' end' in definition) > 0 then
    definition := replace(definition,
      'case when landing_version = ''J版本'' then ''J'' else ''K'' end',
      'case landing_version when ''E版本'' then ''E'' when ''J版本'' then ''J'' else ''K'' end');
    execute definition;
  elsif position('when ''E版本'' then ''E''' in definition) = 0 then
    raise exception 'Unexpected overview definition; aborting';
  end if;
end;
$migration$;
revoke all on function public.submit_x_loan_e_lead(jsonb) from public;
grant execute on function public.submit_x_loan_e_lead(jsonb) to anon, authenticated;
commit;
