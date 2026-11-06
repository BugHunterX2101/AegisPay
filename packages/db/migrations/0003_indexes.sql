-- 0003_indexes: the five from the spec, plus indexes on foreign keys the app joins through.
create index purchase_order_state_idx on purchase_order (state);
create index purchase_order_auth_expires_idx on purchase_order (auth_expires_at);
create index dispute_status_idx on dispute (status);
create index audit_event_entity_idx on audit_event (entity, entity_id, seq);
create index webhook_event_unprocessed_idx on webhook_event (processed_at) where processed_at is null;

create index proposal_mandate_idx on proposal (mandate_id, mandate_version);
create index dispute_order_idx on dispute (order_id);
create index evidence_bundle_dispute_idx on evidence_bundle (dispute_id);
