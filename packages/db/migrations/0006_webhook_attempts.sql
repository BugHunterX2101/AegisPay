-- The webhook worker retries a failing event a bounded number of times, then gives up and leaves the reason in `error`.
-- `attempts` is what bounds it. Lookup indexes for the PayPal ids a webhook carries (it names an authorization, a
-- capture or a PayPal order, never our own order id).
alter table webhook_event add column attempts integer not null default 0;

create index purchase_order_paypal_order_idx on purchase_order (paypal_order_id);
create index purchase_order_auth_history_idx on purchase_order using gin (authorization_history);
