-- 0002_audit_guard: audit_event is append-only at the database level (irreversible by design).
-- The spec also says "revoke TRUNCATE from the app role". On Render the app role owns its tables,
-- so a revoke would be a no-op; a BEFORE TRUNCATE trigger blocks truncation for every role instead.
-- Honest limit: a superuser can still DROP the trigger. This is tamper-EVIDENT (verifyChain), not
-- tamper-proof.

create function audit_event_immutable() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_event is append-only (% blocked)', tg_op
    using errcode = 'integrity_constraint_violation';
end;
$$;

create trigger audit_event_no_update_delete
  before update or delete on audit_event
  for each row execute function audit_event_immutable();

create trigger audit_event_no_truncate
  before truncate on audit_event
  for each statement execute function audit_event_immutable();
