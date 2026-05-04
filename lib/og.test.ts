import { describe, it, expect } from "vitest";
import { validateOgTitle } from "./og";

describe("validateOgTitle", () => {
  it("accepts ASCII alphanumeric strings", () => {
    expect(validateOgTitle("Hello World 123")).toBe("Hello World 123");
  });

  it("accepts Japanese hiragana", () => {
    expect(validateOgTitle("ごみ収集カレンダー")).toBe("ごみ収集カレンダー");
  });

  it("accepts Japanese katakana", () => {
    expect(validateOgTitle("カレンダー")).toBe("カレンダー");
  });

  it("accepts kanji", () => {
    expect(validateOgTitle("江東区 イベント情報")).toBe("江東区 イベント情報");
  });

  it("accepts vowel extender (ー)", () => {
    expect(validateOgTitle("マップ")).toBe("マップ");
  });

  it("trims leading and trailing whitespace before validating", () => {
    expect(validateOgTitle("  江東区  ")).toBe("江東区");
  });

  it("rejects strings longer than 60 characters", () => {
    const long = "あ".repeat(61);
    expect(validateOgTitle(long)).toBeNull();
  });

  it("accepts exactly 60 characters", () => {
    const exactly60 = "あ".repeat(60);
    expect(validateOgTitle(exactly60)).toBe(exactly60);
  });

  it("rejects empty strings after trim", () => {
    expect(validateOgTitle("")).toBeNull();
    expect(validateOgTitle("   ")).toBeNull();
  });

  it("rejects HTML injection attempts", () => {
    expect(validateOgTitle("<script>alert(1)</script>")).toBeNull();
  });

  it("rejects strings with angle brackets", () => {
    expect(validateOgTitle("<title>")).toBeNull();
  });

  it("rejects strings with special symbols", () => {
    expect(validateOgTitle("test & injection")).toBeNull();
  });

  it("rejects strings with newlines", () => {
    expect(validateOgTitle("line1\nline2")).toBeNull();
  });
});
