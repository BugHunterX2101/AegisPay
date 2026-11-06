import { DomainError } from '@aegis/core';
import type { Queryable } from './pool.ts';

export interface SupplierProfile {
  domain: string;
  leadTimeMinDays: number;
  leadTimeMaxDays: number;
  reliability: number;
  /** True when no row exists for the domain and the documented '*' default was used. */
  isDefault: boolean;
}

interface SupplierDbRow {
  domain: string; lead_time_min_days: number; lead_time_max_days: number; reliability: string;
}

const toProfile = (r: SupplierDbRow): SupplierProfile => ({
  domain: r.domain,
  leadTimeMinDays: r.lead_time_min_days,
  leadTimeMaxDays: r.lead_time_max_days,
  reliability: Number(r.reliability), // numeric(3,2) arrives as text
  isDefault: r.domain === '*',
});

/** Same normalisation as the gatekeeper's allow-list check, so a domain matches here exactly when it matches there. */
export const normalizeSupplierDomain = (d: string): string => d.trim().toLowerCase().replace(/\.$/, '').replace(/^www\./, '');

/**
 * Lead time for a supplier. Channel3 returns no delivery estimate, so this table is a SIMULATED input (the UI
 * labels it as such): a per-domain row if seeded, otherwise the '*' default. Throws if the default row is missing,
 * because an agent must never fall back to an invented ETA.
 */
export async function getSupplierProfile(db: Queryable, domain: string): Promise<SupplierProfile> {
  const d = normalizeSupplierDomain(domain);
  const r = await db.query<SupplierDbRow>(
    `select * from supplier_profile where domain in ($1, '*') order by (domain = '*') limit 1`,
    [d],
  );
  if (!r.rows[0]) throw new DomainError('INTERNAL', "supplier_profile has no '*' default row");
  return toProfile(r.rows[0]);
}

export async function listSupplierProfiles(db: Queryable): Promise<SupplierProfile[]> {
  const r = await db.query<SupplierDbRow>('select * from supplier_profile order by (domain = \'*\') desc, domain');
  return r.rows.map(toProfile);
}

export async function upsertSupplierProfile(
  db: Queryable,
  p: { domain: string; leadTimeMinDays: number; leadTimeMaxDays: number; reliability?: number },
): Promise<SupplierProfile> {
  const domain = p.domain === '*' ? '*' : normalizeSupplierDomain(p.domain);
  const problems: string[] = [];
  if (domain === '') problems.push('domain is empty');
  if (!Number.isInteger(p.leadTimeMinDays) || p.leadTimeMinDays < 0) problems.push('leadTimeMinDays must be a non-negative integer');
  if (!Number.isInteger(p.leadTimeMaxDays) || p.leadTimeMaxDays < p.leadTimeMinDays) problems.push('leadTimeMaxDays must be an integer >= leadTimeMinDays');
  if (p.reliability !== undefined && !(p.reliability >= 0 && p.reliability <= 1)) problems.push('reliability must be between 0 and 1');
  if (problems.length > 0) throw new DomainError('VALIDATION', problems.join('; '), { details: problems });

  const r = await db.query<SupplierDbRow>(
    `insert into supplier_profile (domain, lead_time_min_days, lead_time_max_days, reliability)
     values ($1, $2, $3, coalesce($4::numeric, 0.90))
     on conflict (domain) do update
        set lead_time_min_days = excluded.lead_time_min_days,
            lead_time_max_days = excluded.lead_time_max_days,
            reliability = case when $4::numeric is null then supplier_profile.reliability else excluded.reliability end
     returning *`,
    [domain, p.leadTimeMinDays, p.leadTimeMaxDays, p.reliability ?? null],
  );
  return toProfile(r.rows[0]!);
}
