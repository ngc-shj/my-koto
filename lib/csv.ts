// Minimal RFC 4180-style CSV parser. Centralised here (T-02) so the
// generate-pois data pipeline and any future importer share one
// implementation that is unit-tested against the edge cases that
// previously caused user-visible bugs (column shift on quote toggle).
//
// Supported:
// - Double-quote escape `""` for a literal quote inside a quoted field
// - Embedded commas inside quoted fields
// - Quoted fields that contain newlines are NOT supported here because
//   parseCsv splits on /\r?\n/ before tokenising — call sites that need
//   that semantic should pre-clean their input.

export function parseCsvRow(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuote = false;
        continue;
      }
      cur += ch;
    } else {
      if (ch === '"') {
        inQuote = true;
        continue;
      }
      if (ch === ",") {
        out.push(cur);
        cur = "";
        continue;
      }
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export type CsvRow = Record<string, string>;

export function parseCsv(text: string): CsvRow[] {
  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const header = parseCsvRow(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseCsvRow(line);
    const row: CsvRow = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? "";
    });
    return row;
  });
}
