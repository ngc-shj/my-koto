// @vitest-environment node
// openDatasetsDb URL selection: an empty DATASETS_DB_URL (key present but
// blank in .env) must fall back to the local file, not hand libsql "".

import { describe, it, expect, afterEach } from "vitest";
import { openDatasetsDb } from "./client";

const ORIGINAL_URL = process.env["DATASETS_DB_URL"];
const ORIGINAL_TOKEN = process.env["DATASETS_DB_AUTH_TOKEN"];

afterEach(() => {
  if (ORIGINAL_URL === undefined) delete process.env["DATASETS_DB_URL"];
  else process.env["DATASETS_DB_URL"] = ORIGINAL_URL;
  if (ORIGINAL_TOKEN === undefined) delete process.env["DATASETS_DB_AUTH_TOKEN"];
  else process.env["DATASETS_DB_AUTH_TOKEN"] = ORIGINAL_TOKEN;
});

describe("openDatasetsDb", () => {
  it("falls back to the local file when DATASETS_DB_URL is an empty string", () => {
    process.env["DATASETS_DB_URL"] = "";

    // Before the fix this threw LibsqlError URL_INVALID for the "" URL.
    expect(() => openDatasetsDb()).not.toThrow();
  });

  it("uses an explicit url option over the environment", () => {
    process.env["DATASETS_DB_URL"] = "";

    const client = openDatasetsDb({ url: "file::memory:" });
    expect(client).toBeDefined();
  });
});
