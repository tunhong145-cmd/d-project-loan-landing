alter table public.site_settings
  add column if not exists h_line_url text,
  add column if not exists client_copy_next_number_h integer not null default 1;

update public.site_settings
set
  h_line_url = coalesce(h_line_url, e_line_url, line_url),
  client_copy_next_number_h = greatest(coalesce(client_copy_next_number_h, 1), 1)
where id = 1;

alter table public.leads
  add column if not exists client_copy_group text;

create or replace function public.assign_lead_client_copy_number_h(target_lead_id uuid)
returns table (
  client_copy_number integer,
  client_copy_assigned_at timestamptz,
  next_number integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_number integer;
  assigned_time timestamptz;
begin
  perform 1
  from public.site_settings
  where id = 1
  for update;

  select leads.client_copy_number, leads.client_copy_assigned_at
    into current_number, assigned_time
  from public.leads
  where leads.id = target_lead_id
    and upper(coalesce(leads.landing_variant, '')) = 'H'
  for update;

  if not found then
    raise exception 'H lead not found';
  end if;

  if current_number is null then
    select greatest(coalesce(site_settings.client_copy_next_number_h, 1), 1)
      into current_number
    from public.site_settings
    where id = 1;

    assigned_time := now();

    update public.leads
    set client_copy_number = current_number,
        client_copy_group = 'B',
        client_copy_assigned_at = assigned_time,
        updated_at = now()
    where leads.id = target_lead_id;

    update public.site_settings
    set client_copy_next_number_h = current_number + 1,
        updated_at = now()
    where id = 1;
  else
    update public.leads
    set client_copy_group = coalesce(client_copy_group, 'B')
    where leads.id = target_lead_id;
  end if;

  return query
  select
    current_number,
    assigned_time,
    (select site_settings.client_copy_next_number_h from public.site_settings where id = 1);
end;
$$;

grant execute on function public.assign_lead_client_copy_number_h(uuid) to authenticated;
