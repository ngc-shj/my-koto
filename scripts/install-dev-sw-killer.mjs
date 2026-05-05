import { readFileSync, readdirSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const publicDir = join(__dirname, "..", "public");
const killerSrc = join(__dirname, "dev-sw-killer.js");

// Patterns for next-pwa-generated files that must be removed before dev
const REMOVE_PATTERN = /^(sw|workbox-|worker-|fallback-).*\.js(\.map)?$/;

// Remove stale next-pwa artifacts (sw.js, workbox-*.js, worker-*.js, fallback-*.js and .map siblings)
const entries = readdirSync(publicDir);
for (const name of entries) {
  if (REMOVE_PATTERN.test(name)) {
    unlinkSync(join(publicDir, name));
  }
}

// Write the killer SW to public/sw.js
const killerContent = readFileSync(killerSrc, "utf8");
writeFileSync(join(publicDir, "sw.js"), killerContent, "utf8");

console.log("[koto-city] dev-sw-killer installed to public/sw.js");
