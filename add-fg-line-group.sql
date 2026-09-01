alter table public.site_settings
  add column if not exists fg_line_url text;

update public.site_settings
set fg_line_url = coalesce(nullif(trim(fg_line_url), ''), line_url)
where id = 1;
