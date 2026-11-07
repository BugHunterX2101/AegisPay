-- Judge Mode state that the API and the worker must agree on (they are separate processes): today only the demo clock offset.
create table demo_setting (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
