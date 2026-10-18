-- K-only additive migration: make removed intake answers optional without
-- deleting historical values or touching any shared D-project tables.
begin;

alter table public.x_loan_leads
  alter column court_deduction_status drop not null,
  alter column has_passport drop not null,
  alter column q4_foreign_currency_account drop not null;

commit;
