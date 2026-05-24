# Fixtures

CSV snapshots used by `scripts/generate-pois.ts` as a local cache so the
script can re-parse without re-downloading from the upstream during
development. Each file corresponds to one CKAN-resolved CSV resource.

Vitest tests no longer load anything from this directory — they use
synthetic inline records (see `lib/map/validate.test.ts`).

To refresh: delete the relevant file and re-run `npx tsx scripts/generate-pois.ts`
(or just delete the whole directory — the script re-downloads on cache miss).
