/**
 * Time is injected, never read ambiently, so tests and the Judge Mode demo clock are
 * deterministic. The gatekeeper never sees a Clock at all: callers pass `context.now`.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };

/** Fixed instant, for tests. */
export class FixedClock implements Clock {
  constructor(private readonly at: Date) {}
  now(): Date {
    return new Date(this.at.getTime());
  }
}

/**
 * Real time plus an operator-controlled offset (POST /api/demo/clock, Judge Mode only).
 * The offset only moves the app's own notion of "now" (SLA, 29-day windows); it never
 * touches PayPal, whose clock is authoritative for authorization expiry.
 */
export class OffsetClock implements Clock {
  constructor(private offsetMs = 0, private readonly base: Clock = systemClock) {}
  now(): Date {
    return new Date(this.base.now().getTime() + this.offsetMs);
  }
  get offset(): number {
    return this.offsetMs;
  }
  setOffset(ms: number): void {
    if (!Number.isFinite(ms)) throw new RangeError('clock offset must be finite');
    this.offsetMs = ms;
  }
}

export const DAY_MS = 86_400_000;
export const addDays = (d: Date, days: number): Date => new Date(d.getTime() + days * DAY_MS);
