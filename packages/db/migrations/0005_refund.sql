-- Refunds issued against a captured order (FR-19, and the PROOF_OF_REFUND dispute evidence).
-- A table rather than a column: partial refunds are several rows, and the sum must never exceed the capture.
create table refund (
  refund_id text primary key,                         -- PayPal refund id
  order_id uuid not null references purchase_order (id),
  amount_minor bigint not null check (amount_minor > 0),
  status text not null check (status in ('COMPLETED', 'PENDING', 'FAILED', 'CANCELLED')),
  reason text not null,
  confirmed_by text not null,                         -- refunds always need a human confirm
  created_at timestamptz not null default now()
);

create index refund_order_idx on refund (order_id);
