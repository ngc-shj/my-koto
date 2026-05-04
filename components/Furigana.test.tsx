import { describe, expect, it, beforeEach } from "vitest";
import { act } from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { DistrictName, Furigana, KanjiText } from "./Furigana";
import { setFuriganaEnabled } from "@/lib/a11y/preferences";

beforeEach(() => {
  window.localStorage.removeItem("a11y_furigana_v1");
});

describe("Furigana", () => {
  it("renders plain text when the preference is off", () => {
    render(<Furigana text="亀戸" reading="かめいど" />);
    expect(screen.getByText("亀戸")).toBeInTheDocument();
    // The <rt> element is hidden behind a ruby — when furigana is off
    // we should not render a <ruby> at all.
    expect(document.querySelector("ruby")).toBeNull();
  });

  it("renders ruby + rt when the preference is on", () => {
    setFuriganaEnabled(true);
    render(<Furigana text="亀戸" reading="かめいど" />);
    const ruby = document.querySelector("ruby");
    expect(ruby).not.toBeNull();
    expect(ruby?.textContent).toContain("亀戸");
    expect(document.querySelector("rt")?.textContent).toBe("かめいど");
  });

  it("falls back to plain text when no reading is provided", () => {
    setFuriganaEnabled(true);
    render(<Furigana text="亀戸" />);
    expect(document.querySelector("ruby")).toBeNull();
    expect(screen.getByText("亀戸")).toBeInTheDocument();
  });

  it("falls back to plain text when reading equals text", () => {
    setFuriganaEnabled(true);
    render(<Furigana text="きば" reading="きば" />);
    expect(document.querySelector("ruby")).toBeNull();
  });

  it("re-renders when the preference toggles after mount", () => {
    render(<Furigana text="亀戸" reading="かめいど" />);
    expect(document.querySelector("ruby")).toBeNull();
    act(() => {
      setFuriganaEnabled(true);
    });
    expect(document.querySelector("ruby")).not.toBeNull();
    act(() => {
      setFuriganaEnabled(false);
    });
    expect(document.querySelector("ruby")).toBeNull();
  });
});

describe("DistrictName", () => {
  it("renders the district label resolved from districts.json", () => {
    render(<DistrictName id="kameido-1-3" />);
    // The label depends on the bundled CSV; assert presence of a kanji
    // substring that any plausible row for this id should contain.
    expect(screen.getByText(/亀戸/)).toBeInTheDocument();
  });

  it("falls back to the raw id when the district is unknown", () => {
    render(<DistrictName id="not-a-real-district" />);
    expect(screen.getByText("not-a-real-district")).toBeInTheDocument();
  });

  it("attaches reading as ruby when the preference is on", () => {
    setFuriganaEnabled(true);
    render(<DistrictName id="kameido-1-3" />);
    expect(document.querySelector("ruby")).not.toBeNull();
  });
});

describe("KanjiText", () => {
  it("renders ruby for known dictionary entries when furigana is on", () => {
    setFuriganaEnabled(true);
    render(<KanjiText text="燃やすごみ" />);
    const ruby = document.querySelector("ruby");
    expect(ruby).not.toBeNull();
    expect(document.querySelector("rt")?.textContent).toBe("もやすごみ");
  });

  it("falls back to plain text for entries with no dictionary reading", () => {
    setFuriganaEnabled(true);
    // "AED" is intentionally absent from the readings table — no useful
    // ruby exists for an English acronym.
    render(<KanjiText text="AED" />);
    expect(document.querySelector("ruby")).toBeNull();
    expect(screen.getByText("AED")).toBeInTheDocument();
  });

  it("renders plain text when the preference is off, even for known entries", () => {
    render(<KanjiText text="燃やすごみ" />);
    expect(document.querySelector("ruby")).toBeNull();
    expect(screen.getByText("燃やすごみ")).toBeInTheDocument();
  });

  it("looks up gomi categories, hazards, areas, and map layers", () => {
    setFuriganaEnabled(true);
    const { rerender } = render(<KanjiText text="洪水" />);
    expect(document.querySelector("rt")?.textContent).toBe("こうずい");
    rerender(<KanjiText text="深川地域" />);
    expect(document.querySelector("rt")?.textContent).toBe("ふかがわちいき");
    rerender(<KanjiText text="避難所" />);
    expect(document.querySelector("rt")?.textContent).toBe("ひなんじょ");
    rerender(<KanjiText text="図書館" />);
    expect(document.querySelector("rt")?.textContent).toBe("としょかん");
  });
});
