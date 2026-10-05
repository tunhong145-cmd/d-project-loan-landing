-- K only: keep phone required without restricting formatting.
begin;
set local lock_timeout = '5s';
alter table public.x_loan_leads drop constraint if exists x_loan_leads_phone_check;
alter table public.x_loan_leads add constraint x_loan_leads_phone_check check (length(trim(phone)) > 0);
commit;
