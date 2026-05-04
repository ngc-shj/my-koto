# Fixtures

Fixture files for testing Zod schemas against real API responses.

## Last fetch

| Dataset | Status | Fetched at |
|---------|--------|------------|
| aed | error: HTTP 404 for https://service.api.metro.tokyo.lg.jp/v1/dataset/t131083d0000000027 | 2026-05-04T09:21:01.984Z |
| toilet | error: HTTP 404 for https://service.api.metro.tokyo.lg.jp/v1/dataset/t131083d0000000019 | 2026-05-04T09:21:01.984Z |
| gomi | error: HTTP 404 for https://service.api.metro.tokyo.lg.jp/v1/dataset/t131083d3100000009-671838441b8036aa352b967b5514a545 | 2026-05-04T09:21:01.984Z |
| events | error: HTTP 404 for https://service.api.metro.tokyo.lg.jp/v1/dataset/t131083d0000000017-252a3033bb76c746c8ee30c24a3a2b5a-0 | 2026-05-04T09:21:01.984Z |

## Usage

These files are committed to the repository and used in Vitest tests.
Re-run `npx tsx scripts/refresh-fixtures.ts` to update with fresh API data.
