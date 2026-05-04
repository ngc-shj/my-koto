import { describe, it, expect } from "vitest";
import { parseCsv, parseCsvRow } from "./csv";

describe("parseCsvRow", () => {
  it("splits a simple row on commas", () => {
    expect(parseCsvRow("a,b,c")).toEqual(["a", "b", "c"]);
  });

  it("preserves an embedded comma inside double quotes", () => {
    expect(parseCsvRow('"江東区,1-1-1",foo')).toEqual(["江東区,1-1-1", "foo"]);
  });

  it('decodes a literal "" quote escape inside quoted field', () => {
    expect(parseCsvRow('"a""b",c')).toEqual(['a"b', "c"]);
  });

  it("treats a trailing comma as an empty cell", () => {
    expect(parseCsvRow("a,b,")).toEqual(["a", "b", ""]);
  });

  it("treats a leading comma as an empty cell", () => {
    expect(parseCsvRow(",a")).toEqual(["", "a"]);
  });

  it("returns one empty cell on empty input", () => {
    expect(parseCsvRow("")).toEqual([""]);
  });

  it("supports a single quoted field", () => {
    expect(parseCsvRow('"only"')).toEqual(["only"]);
  });

  it("retains literal whitespace inside quoted fields", () => {
    expect(parseCsvRow('" 江東区 ",x')).toEqual([" 江東区 ", "x"]);
  });

  it("tolerates quoted field with multiple escaped quotes", () => {
    expect(parseCsvRow('"a""b""c"')).toEqual(['a"b"c']);
  });

  it("does not collapse adjacent commas inside quoted fields", () => {
    expect(parseCsvRow('"a,,b"')).toEqual(["a,,b"]);
  });
});

describe("parseCsv", () => {
  it("parses a header + rows into objects", () => {
    const text = "name,age\nalice,30\nbob,25";
    expect(parseCsv(text)).toEqual([
      { name: "alice", age: "30" },
      { name: "bob", age: "25" },
    ]);
  });

  it("handles CRLF line endings", () => {
    const text = "a,b\r\n1,2\r\n3,4";
    expect(parseCsv(text)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("ignores blank lines", () => {
    const text = "a,b\n1,2\n\n3,4\n";
    expect(parseCsv(text)).toEqual([
      { a: "1", b: "2" },
      { a: "3", b: "4" },
    ]);
  });

  it("returns empty array for empty input", () => {
    expect(parseCsv("")).toEqual([]);
  });

  it("preserves quoted commas across the whole table", () => {
    const text = 'addr,name\n"江東区,1-1-1",alice\n"中央区,2-2-2",bob';
    expect(parseCsv(text)).toEqual([
      { addr: "江東区,1-1-1", name: "alice" },
      { addr: "中央区,2-2-2", name: "bob" },
    ]);
  });

  it("fills missing trailing columns with empty string", () => {
    const text = "a,b,c\n1,2";
    expect(parseCsv(text)).toEqual([{ a: "1", b: "2", c: "" }]);
  });

  it("preserves embedded LF inside quoted fields (Tokyo Met 避難所 CSV pattern)", () => {
    const text = 'a,b\n"line1\nline2",x\n"plain",y';
    expect(parseCsv(text)).toEqual([
      { a: "line1\nline2", b: "x" },
      { a: "plain", b: "y" },
    ]);
  });

  it("preserves embedded CRLF inside quoted fields", () => {
    const text = 'a,b\r\n"line1\r\nline2",x\r\nplain,y';
    expect(parseCsv(text)).toEqual([
      { a: "line1\r\nline2", b: "x" },
      { a: "plain", b: "y" },
    ]);
  });

  it("handles a quoted field whose newline is the row terminator (no escape)", () => {
    const text = 'a,b\n"foo","bar\nbaz"\nfin,end';
    expect(parseCsv(text)).toEqual([
      { a: "foo", b: "bar\nbaz" },
      { a: "fin", b: "end" },
    ]);
  });
});
