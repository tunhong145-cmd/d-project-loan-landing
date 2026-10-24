begin;
create table public.repository_display_settings (
 site_id text primary key check(site_id in ('main','copy1','copy2','copy3','copy4','copy5','copy6','copy7','copy8')),
 name text not null check(length(trim(name)) between 1 and 40),
 domain text not null check(length(domain)<=253 and domain ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
 revision integer not null default 1
);
alter table public.repository_display_settings enable row level security;
revoke all on public.repository_display_settings from public,anon,authenticated;
create function public.get_repository_display_settings() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.is_d_main_admin() is not true then raise exception 'ACCESS_DENIED'; end if;
 return coalesce((select jsonb_agg(to_jsonb(s)) from public.repository_display_settings s),'[]'::jsonb);
end; $$;
create function public.save_repository_display_settings(p_site_id text,p_name text,p_domain text,p_revision integer) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if public.is_d_main_admin() is not true then raise exception 'ACCESS_DENIED'; end if;
 update public.repository_display_settings set name=trim(p_name),domain=lower(trim(p_domain)),revision=revision+1
 where site_id=p_site_id and revision=p_revision returning to_jsonb(repository_display_settings) into result;
 if result is null then raise exception '設定已由其他人修改，請重新載入後再試'; end if;
 return result;
end; $$;
revoke all on function public.get_repository_display_settings(),public.save_repository_display_settings(text,text,text,integer) from public,anon;
grant execute on function public.get_repository_display_settings(),public.save_repository_display_settings(text,text,text,integer) to authenticated;
insert into public.repository_display_settings(site_id,name,domain) values
 ('main','主倉庫X','azimutha.top'),
 ('copy1','複製倉庫一','aetherices.top'),
 ('copy2','複製倉庫二J','basalta.top'),
 ('copy3','複製倉庫三','vectes.top'),
 ('copy4','複製倉庫四J','vexisds.top'),
 ('copy5','複製倉庫五M','sinterl.top'),
 ('copy6','複製倉庫六X','sonsora.top'),
 ('copy7','複製倉庫七','chromaqs.top'),
 ('copy8','複製倉庫八J','stratao.top');
commit;
