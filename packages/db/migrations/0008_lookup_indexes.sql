-- 0008_lookup_indexes: make the hot lookups use an index, and drop one that only cost writes.
-- (Plain CREATE INDEX, not CONCURRENTLY: the migrator runs each file in a transaction.)

-- The audit trail of one entity is read by entity_id alone (order detail grid, dispute modal, "already flagged?" checks,
-- declined-attempt counts). audit_event_entity_idx leads with `entity`, which those queries do not filter on, so they
-- scanned the whole append-only log, a table that only ever grows.
create index audit_event_entity_id_idx on audit_event (entity_id, seq);

-- Webhooks name an authorization; findOrderIdByPayPalRef matches it against authorization_history (the GIN index from
-- 0006, used through `@>`) or authorization_id. With a btree on authorization_id the planner can combine the two.
create index purchase_order_authorization_idx on purchase_order (authorization_id);

-- 0006 indexed paypal_order_id, but its UNIQUE constraint (0001) already maintains an identical btree.
drop index if exists purchase_order_paypal_order_idx;
