-- 0004_supplier_profile: lookup of supplier lead time by domain.
-- Channel3 has no ETA field, so lead time is a SIMULATED input and the UI labels it as such.
-- The '*' row is the documented default (3-7 days); scripts/seed.ts adds per-domain rows.
create table supplier_profile (
  domain text primary key check (domain = lower(domain)),
  lead_time_min_days int not null check (lead_time_min_days >= 0),
  lead_time_max_days int not null,
  reliability numeric(3,2) not null default 0.90 check (reliability between 0 and 1),
  check (lead_time_max_days >= lead_time_min_days)
);

insert into supplier_profile (domain, lead_time_min_days, lead_time_max_days, reliability)
values ('*', 3, 7, 0.90);
