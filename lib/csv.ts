// Minimal RFC 4180-style CSV parser. Centralised here (T-02) so the
// generate-pois data pipeline and any future importer share one
// implementation that is unit-tested against the edge cases that
// previously caused user-visible bugs (column shift on quote toggle).
//
// Supported:
// - Double-quote escape `""` for a literal quote inside a quoted field
// - Embedded commas inside quoted fields
// - Embedded LF/CRLF inside quoted fields (the Tokyo Met 避難所 CSV uses
//   this in the "エレベーター有/避難スペースが１階" header)

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

// Tokenise the entire text into rows of cells in a single pass. The previous
// implementation split on /\r?\n/ first, which corrupted any quoted field
// containing a newline (Tokyo Met 避難所 CSV ships such headers).
function parseCsvAll(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuote) {
      if (ch === '"' && text[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      if (ch === '"') {
        inQuote = false;
        continue;
      }
      // Inside quotes, every other character is literal — including \r and \n.
      cur += ch;
    } else {
      if (ch === '"') {
        inQuote = true;
        continue;
      }
      if (ch === ",") {
        row.push(cur);
        cur = "";
        continue;
      }
      if (ch === "\r") {
        // Pair with following \n if present; otherwise treat lone \r as terminator.
        if (text[i + 1] === "\n") i += 1;
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        continue;
      }
      if (ch === "\n") {
        row.push(cur);
        rows.push(row);
        row = [];
        cur = "";
        continue;
      }
      cur += ch;
    }
  }
  // Flush whatever remained without a trailing newline.
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // Drop blank rows. A row is blank when every cell is empty — covers the
  // single-cell case from a trailing newline as well as the multi-cell
  // `,,,,,` prefix line that the Tokyo Met 避難所 CSV starts with.
  return rows.filter((r) => r.some((c) => c !== ""));
}

export function parseCsv(text: string): CsvRow[] {
  const rows = parseCsvAll(text);
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const row: CsvRow = {};
    header.forEach((key, i) => {
      row[key] = cells[i] ?? "";
    });
    return row;
  });
}
