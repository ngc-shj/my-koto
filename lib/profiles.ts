// Multi-profile district storage for "家・職場・実家" use cases.
//
// The single legacy key `district_id` only let a user pin one address. This
// module replaces that with a first-class profile collection persisted as a
// single JSON blob, plus a one-shot migration so existing visitors don't
// lose their pinned district when they upgrade.
//
// SSR-safe: every accessor early-returns sane defaults when `window` is
// undefined so React Server Components can call them without guarding at
// each site.

import { z } from "zod";
import { isBrowser } from "@/lib/ssr";

const STORAGE_KEY = "district_profiles_v1";
// Legacy single-district key. Read once during migration, then deleted so
// the allowlist disclosure on /privacy stays accurate.
const LEGACY_DISTRICT_KEY = "district_id";

const MAX_PROFILES = 5;
const MAX_NAME_LENGTH = 20;

const ProfileSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(MAX_NAME_LENGTH),
  districtId: z.string().regex(/^[a-z0-9-]+$/).max(64),
  createdAt: z.number().int().positive(),
});

const ProfilesEnvelopeSchema = z.object({
  version: z.literal(1),
  profiles: z.array(ProfileSchema).max(MAX_PROFILES),
  activeId: z.string().nullable(),
});

export type Profile = z.infer<typeof ProfileSchema>;
export type ProfilesEnvelope = z.infer<typeof ProfilesEnvelopeSchema>;

export const PROFILE_LIMITS = {
  maxProfiles: MAX_PROFILES,
  maxNameLength: MAX_NAME_LENGTH,
} as const;

const EMPTY_ENVELOPE: ProfilesEnvelope = {
  version: 1,
  profiles: [],
  activeId: null,
};

function readEnvelope(): ProfilesEnvelope {
  if (!isBrowser()) return EMPTY_ENVELOPE;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (raw == null) return migrateLegacy();
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = ProfilesEnvelopeSchema.safeParse(json);
    if (parsed.success) return parsed.data;
  } catch {
    // Corrupted JSON — fall through to migration as a best-effort recovery.
  }
  return migrateLegacy();
}

function writeEnvelope(env: ProfilesEnvelope): void {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(env));
}

// Read the legacy `district_id` key once. If present, promote it to a
// default profile named "メイン" and clear the legacy key. Returns the
// resulting envelope. Idempotent — running migration on an already-migrated
// localStorage just yields an empty envelope.
function migrateLegacy(): ProfilesEnvelope {
  if (!isBrowser()) return EMPTY_ENVELOPE;
  const legacy = window.localStorage.getItem(LEGACY_DISTRICT_KEY);
  if (legacy == null || legacy === "") return EMPTY_ENVELOPE;
  const profile: Profile = {
    id: generateId(),
    name: "メイン",
    districtId: legacy,
    createdAt: Date.now(),
  };
  const env: ProfilesEnvelope = {
    version: 1,
    profiles: [profile],
    activeId: profile.id,
  };
  // Validate before writing — defends against legacy values that don't
  // match the district id pattern (very rare but cheap to guard).
  const checked = ProfilesEnvelopeSchema.safeParse(env);
  if (!checked.success) return EMPTY_ENVELOPE;
  writeEnvelope(env);
  window.localStorage.removeItem(LEGACY_DISTRICT_KEY);
  return env;
}

function generateId(): string {
  // Browser-only crypto — sufficient since the ids are user-private and
  // collisions inside the 5-profile cap are astronomically unlikely.
  if (isBrowser() && "randomUUID" in crypto) {
    return `p_${crypto.randomUUID().slice(0, 12)}`;
  }
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

// --- queries -----------------------------------------------------------

export function getProfiles(): Profile[] {
  return readEnvelope().profiles;
}

export function getActiveProfile(): Profile | null {
  const env = readEnvelope();
  if (env.activeId == null) return null;
  return env.profiles.find((p) => p.id === env.activeId) ?? null;
}

export function getActiveDistrictId(): string | null {
  return getActiveProfile()?.districtId ?? null;
}

// --- mutations ---------------------------------------------------------

export type ProfileMutationError =
  | "name-empty"
  | "name-too-long"
  | "limit-reached"
  | "duplicate-name"
  | "not-found";

function findByNameCaseInsensitive(
  profiles: Profile[],
  name: string,
  exceptId?: string,
): Profile | undefined {
  const lower = name.trim().toLowerCase();
  return profiles.find(
    (p) => p.name.toLowerCase() === lower && p.id !== exceptId,
  );
}

export function createProfile(input: {
  name: string;
  districtId: string;
}): { ok: true; profile: Profile } | { ok: false; error: ProfileMutationError } {
  const name = input.name.trim();
  if (name === "") return { ok: false, error: "name-empty" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "name-too-long" };
  const env = readEnvelope();
  if (env.profiles.length >= MAX_PROFILES) {
    return { ok: false, error: "limit-reached" };
  }
  if (findByNameCaseInsensitive(env.profiles, name)) {
    return { ok: false, error: "duplicate-name" };
  }
  const profile: Profile = {
    id: generateId(),
    name,
    districtId: input.districtId,
    createdAt: Date.now(),
  };
  const next: ProfilesEnvelope = {
    ...env,
    profiles: [...env.profiles, profile],
    // First profile becomes active automatically.
    activeId: env.activeId ?? profile.id,
  };
  writeEnvelope(next);
  return { ok: true, profile };
}

export function renameProfile(
  id: string,
  rawName: string,
): { ok: true; profile: Profile } | { ok: false; error: ProfileMutationError } {
  const name = rawName.trim();
  if (name === "") return { ok: false, error: "name-empty" };
  if (name.length > MAX_NAME_LENGTH) return { ok: false, error: "name-too-long" };
  const env = readEnvelope();
  const target = env.profiles.find((p) => p.id === id);
  if (!target) return { ok: false, error: "not-found" };
  if (findByNameCaseInsensitive(env.profiles, name, id)) {
    return { ok: false, error: "duplicate-name" };
  }
  const updated: Profile = { ...target, name };
  const next: ProfilesEnvelope = {
    ...env,
    profiles: env.profiles.map((p) => (p.id === id ? updated : p)),
  };
  writeEnvelope(next);
  return { ok: true, profile: updated };
}

export function setProfileDistrict(
  id: string,
  districtId: string,
): { ok: true; profile: Profile } | { ok: false; error: ProfileMutationError } {
  const env = readEnvelope();
  const target = env.profiles.find((p) => p.id === id);
  if (!target) return { ok: false, error: "not-found" };
  const updated: Profile = { ...target, districtId };
  const next: ProfilesEnvelope = {
    ...env,
    profiles: env.profiles.map((p) => (p.id === id ? updated : p)),
  };
  writeEnvelope(next);
  return { ok: true, profile: updated };
}

export function deleteProfile(
  id: string,
): { ok: true } | { ok: false; error: ProfileMutationError } {
  const env = readEnvelope();
  if (!env.profiles.find((p) => p.id === id)) {
    return { ok: false, error: "not-found" };
  }
  const remaining = env.profiles.filter((p) => p.id !== id);
  const nextActive =
    env.activeId === id ? (remaining[0]?.id ?? null) : env.activeId;
  const next: ProfilesEnvelope = {
    ...env,
    profiles: remaining,
    activeId: nextActive,
  };
  writeEnvelope(next);
  return { ok: true };
}

export function setActiveProfile(
  id: string,
): { ok: true } | { ok: false; error: ProfileMutationError } {
  const env = readEnvelope();
  if (!env.profiles.find((p) => p.id === id)) {
    return { ok: false, error: "not-found" };
  }
  writeEnvelope({ ...env, activeId: id });
  return { ok: true };
}

// --- legacy bridge -----------------------------------------------------
//
// Existing call sites (DistrictSelector, /settings, /gomi) still call
// setDistrictId/getDistrictId from config/storage.ts. We keep those
// stable by routing them through the active profile here.

export function legacySetDistrictForActive(districtId: string): void {
  const env = readEnvelope();
  if (env.activeId != null) {
    setProfileDistrict(env.activeId, districtId);
    return;
  }
  // No profiles yet: create a default named "メイン" so the first ever
  // district pick from a fresh device still produces a sensible profile.
  createProfile({ name: "メイン", districtId });
}

// Drops everything this module owns. Used by the /settings "clear all"
// button alongside other allowlist-cleared keys.
export function clearAllProfiles(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
}
