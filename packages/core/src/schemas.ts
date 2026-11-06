import { z } from 'zod';

/** Shared by API (validation) and web (forms). Money crosses the wire as minor-unit strings. */
export const MinorString = z.string().regex(/^\d{1,18}$/, 'minor units as a decimal string');
export const IsoDate = z.iso.date();
export const IsoDateTime = z.iso.datetime({ offset: true });
export const CurrencySchema = z.literal('USD');

export const MandateSpecSchema = z.object({
  keywords: z.array(z.string().trim().min(1).max(80)).min(1).max(12),
  mustInclude: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
  mustExclude: z.array(z.string().trim().min(1).max(80)).max(12).optional(),
});

/** What the parser agent emits and the human confirms. Never persisted until confirmed. */
export const MandateDraftSchema = z.object({
  spec: MandateSpecSchema,
  quantity: z.number().int().min(1).max(100_000),
  unitCeiling: MinorString,
  budget: MinorString,
  currency: CurrencySchema,
  deliverBy: IsoDate,
  minRating: z.number().min(0).max(5).optional(),
  allowedDomains: z.array(z.string().trim().toLowerCase().min(3).max(253)).max(50).optional(),
  approvalThreshold: MinorString.optional(),
  expiresAt: IsoDateTime.optional(),
});
export type MandateDraft = z.infer<typeof MandateDraftSchema>;

export const ParseMandateBody = z.object({ text: z.string().trim().min(8).max(2000) });
export const CreateMandateBody = z.object({
  draft: MandateDraftSchema,
  sourceText: z.string().trim().max(2000).optional(),
});

export const CARRIERS = ['FEDEX', 'UPS', 'USPS', 'DHL', 'DHL_API', 'OTHER'] as const;
export const ShipBody = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().trim().min(4).max(64).regex(/^[A-Za-z0-9\-]+$/),
});

export const DemoClockBody = z.object({ offsetDays: z.number().int().min(0).max(60) });

export const DisputeSubmitBody = z.object({
  bundleId: z.string().uuid(),
  attested: z.literal(true),
});

export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
    paypalDebugId: z.string().nullable().optional(),
    requestId: z.string(),
  }),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export const SSE_EVENTS = [
  'order.upsert',
  'mandate.draft',
  'agent.step',
  'gate.decision',
  'webhook.verified',
  'dispute.upsert',
  'selfcheck.result',
] as const;
export type SseEventName = (typeof SSE_EVENTS)[number];
export const SseEnvelope = z.object({
  event: z.enum(SSE_EVENTS),
  /** audit_event.seq when the event is backed by an audit row (Last-Event-ID replay) */
  id: z.number().int().optional(),
  data: z.unknown(),
});
export type SseEnvelope = z.infer<typeof SseEnvelope>;
