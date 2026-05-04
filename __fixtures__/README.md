# Fixtures

Fixture files for testing Zod schemas against real API responses.

## Last fetch

Not yet fetched. Run `npx tsx scripts/refresh-fixtures.ts` to populate.

## Usage

These files are committed to the repository and used in Vitest tests.
Re-run `npx tsx scripts/refresh-fixtures.ts` to update with fresh API data.

## Directory structure

- `opendata/` — Real API responses saved by `refresh-fixtures.ts`
- `schemas/*/valid.json` — Valid fixture for each Zod schema (positive test)
- `schemas/*/invalid.json` — Invalid fixture for each Zod schema (negative test)
