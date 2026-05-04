// CSP violation report storage.
//
// We accept reports posted by browsers via the Reporting API v1 envelope,
// strip them down to a sanitised shape (no query strings, truncated samples,
// browser-family user agent only), and keep the latest N in a Vercel KV
// LIST so /status can render a "recent violations" panel without a full
// observability pipeline.

import { kv as vercelKv } from "@vercel/kv";
import { z } from "zod";

const STORAGE_KEY = "csp:reports:v1";
// Capped FIFO so the panel stays readable and KV usage stays bounded.
const RETENTION_LIMIT = 50;
// Soft cap on per-field length we accept from the upstream payload before
// truncation. CSP reports occasionally include long original policy strings
// or HTML samples that we don't want to keep verbatim.
const MAX_FIELD_LENGTH = 256;
const MAX_SAMPLE_LENGTH = 200;

// Liberal schema — browsers vary in which fields they populate. We only
// require the fields we actually surface; everything else is optional and
// dropped during sanitisation.
export const RawReportBodySchema = z
  .object({
    blockedURL: z.string().optional(),
    "blocked-uri": z.string().optional(),
    documentURL: z.string().optional(),
    "document-uri": z.string().optional(),
    referrer: z.string().optional(),
    violatedDirective: z.string().optional(),
    "violated-directive": z.string().optional(),
    effectiveDirective: z.string().optional(),
    "effective-directive": z.string().optional(),
    disposition: z.string().optional(),
    sourceFile: z.string().optional(),
    "source-file": z.string().optional(),
    lineNumber: z.number().optional(),
    "line-number": z.number().optional(),
    columnNumber: z.number().optional(),
    sample: z.string().optional(),
    statusCode: z.number().optional(),
    "status-code": z.number().optional(),
  })
  .passthrough();

export const RawReportSchema = z
  .object({
    type: z.string().optional(),
    url: z.string().optional(),
    user_agent: z.string().optional(),
    age: z.number().optional(),
    body: RawReportBodySchema.optional(),
  })
  .passthrough();

export type RawReport = z.infer<typeof RawReportSchema>;

// Sanitised shape — the only thing we ever read back from KV.
export const StoredReportSchema = z.object({
  receivedAt: z.number().int().positive(),
  documentPath: z.string().max(MAX_FIELD_LENGTH),
  blockedURL: z.string().max(MAX_FIELD_LENGTH),
  violatedDirective: z.string().max(MAX_FIELD_LENGTH),
  effectiveDirective: z.string().max(MAX_FIELD_LENGTH).optional(),
  disposition: z.enum(["enforce", "report"]).optional(),
  sourceFile: z.string().max(MAX_FIELD_LENGTH).optional(),
  lineNumber: z.number().int().nonnegative().optional(),
  sample: z.string().max(MAX_SAMPLE_LENGTH).optional(),
  userAgentFamily: z.string().max(32).optional(),
});

export type StoredReport = z.infer<typeof StoredReportSchema>;

function truncate(value: string | undefined, max: number): string | undefined {
  if (value == null) return undefined;
  return value.length > max ? value.slice(0, max) : value;
}

// Reduce a full URL down to its path. Drops query string and fragment so the
// stored value cannot retain user-supplied query parameters that might leak
// PII via the URL even though the page itself does not use them.
function pathOnly(raw: string | undefined): string {
  if (!raw) return "";
  try {
    const u = new URL(raw);
    return `${u.origin}${u.pathname}`.slice(0, MAX_FIELD_LENGTH);
  } catch {
    return raw.slice(0, MAX_FIELD_LENGTH);
  }
}

// Identify the browser family but discard version + locale + GPU fingerprints.
// CSP reports are infrequent so this gives operators enough signal to spot
// "all reports are from one extension" without persisting a tracking-grade
// user-agent string.
export function classifyUserAgent(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Safari\//i.test(ua)) return "Safari";
  if (/Chromium/i.test(ua)) return "Chromium";
  return "Other";
}

function pickFirst(...values: Array<string | undefined>): string | undefined {
  for (const v of values) {
    if (v != null && v !== "") return v;
  }
  return undefined;
}

function pickFirstNumber(
  ...values: Array<number | undefined>
): number | undefined {
  for (const v of values) {
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return undefined;
}

// Convert an upstream report into our StoredReport, returning null if it
// lacks enough information to be useful (no documentURL AND no directive).
export function sanitise(raw: RawReport, now = Date.now()): StoredReport | null {
  const body = raw.body ?? {};
  const documentRaw = pickFirst(body.documentURL, body["document-uri"], raw.url);
  const blockedRaw = pickFirst(body.blockedURL, body["blocked-uri"]);
  const violatedDirective = pickFirst(
    body.violatedDirective,
    body["violated-directive"],
  );
  if (!documentRaw && !violatedDirective) return null;
  const dispositionRaw = body.disposition;
  const disposition: StoredReport["disposition"] | undefined =
    dispositionRaw === "enforce" || dispositionRaw === "report"
      ? dispositionRaw
      : undefined;
  const candidate: StoredReport = {
    receivedAt: now,
    documentPath: pathOnly(documentRaw),
    blockedURL: pathOnly(blockedRaw),
    violatedDirective: truncate(violatedDirective, MAX_FIELD_LENGTH) ?? "",
    effectiveDirective: truncate(
      pickFirst(body.effectiveDirective, body["effective-directive"]),
      MAX_FIELD_LENGTH,
    ),
    disposition,
    sourceFile: truncate(
      pickFirst(body.sourceFile, body["source-file"]),
      MAX_FIELD_LENGTH,
    ),
    lineNumber: pickFirstNumber(body.lineNumber, body["line-number"]),
    sample: truncate(body.sample, MAX_SAMPLE_LENGTH),
    userAgentFamily: classifyUserAgent(raw.user_agent),
  };
  const parsed = StoredReportSchema.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

// Minimal client surface so tests can pass a Map-backed double instead of
// configuring real KV.
export interface CspReportKv {
  lpush(key: string, value: string): Promise<unknown>;
  ltrim(key: string, start: number, stop: number): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export function defaultCspReportKv(): CspReportKv {
  return vercelKv as unknown as CspReportKv;
}

export async function appendReport(
  kv: CspReportKv,
  report: StoredReport,
): Promise<void> {
  await kv.lpush(STORAGE_KEY, JSON.stringify(report));
  await kv.ltrim(STORAGE_KEY, 0, RETENTION_LIMIT - 1);
}

export async function listReports(kv: CspReportKv): Promise<StoredReport[]> {
  // Vercel KV's lrange is generic over the element type; some snapshots
  // automatically JSON.parse, others return strings. We accept either.
  const raw = (await kv.lrange(STORAGE_KEY, 0, -1)) as unknown[];
  const out: StoredReport[] = [];
  for (const item of raw) {
    const parsed = StoredReportSchema.safeParse(
      typeof item === "string" ? safeParseJson(item) : item,
    );
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

function safeParseJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

export const CSP_REPORT_LIMITS = {
  retentionLimit: RETENTION_LIMIT,
  maxFieldLength: MAX_FIELD_LENGTH,
  maxSampleLength: MAX_SAMPLE_LENGTH,
} as const;
