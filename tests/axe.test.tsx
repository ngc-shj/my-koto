/**
 * Accessibility tests using vitest-axe.
 *
 * Coverage strategy:
 * - Static Server Components (no data fetch): renderToString → JSDOM → axe
 * - Client Components: @testing-library/react render → axe
 *
 * Pages excluded from this test file (require data fetch or complex mocking):
 * - app/page.tsx            — depends on WeatherWidget (fetch /api/weather)
 * - app/gomi/page.tsx       — needs JSON data + Client state
 * - app/gomi/search/page.tsx — needs search index + Client state
 * - app/events/page.tsx     — needs events JSON + date filtering
 * - app/map/page.tsx        — needs AED/toilet JSON + MapLibre
 * - app/weather/page.tsx    — Client Component with live fetch
 * - app/settings/page.tsx   — Client Component with localStorage
 */

import { describe, it, expect } from "vitest";
import { axe } from "vitest-axe";
import { renderToString } from "react-dom/server";
import { render, fireEvent } from "@testing-library/react";
import React from "react";

// --- Static Server Component pages ---

import AboutPage from "@/app/about/page";
import PrivacyPage from "@/app/privacy/page";
import DisclaimerPage from "@/app/disclaimer/page";
import NotFoundPage from "@/app/not-found";
import OfflinePage from "@/app/offline/page";

// --- Client Components ---

import Attribution from "@/components/Attribution";
import ShareButton from "@/components/ShareButton";
import EmergencyContactCard from "@/components/EmergencyContactCard";
import EmergencyChecklist from "@/components/EmergencyChecklist";

// Helper: render a Server Component to a DOM element via renderToString + JSDOM.
function renderServerComponent(element: React.ReactElement): HTMLElement {
  const html = renderToString(element);
  const container = document.createElement("div");
  container.innerHTML = html;
  document.body.appendChild(container);
  return container;
}

describe("Accessibility (axe) — static Server Component pages", () => {
  it("AboutPage has no violations", async () => {
    const container = renderServerComponent(React.createElement(AboutPage));
    expect(await axe(container)).toHaveNoViolations();
    container.remove();
  });

  it("PrivacyPage has no violations", async () => {
    const container = renderServerComponent(React.createElement(PrivacyPage));
    expect(await axe(container)).toHaveNoViolations();
    container.remove();
  });

  it("DisclaimerPage has no violations", async () => {
    const container = renderServerComponent(
      React.createElement(DisclaimerPage),
    );
    expect(await axe(container)).toHaveNoViolations();
    container.remove();
  });

  it("NotFound page has no violations", async () => {
    const container = renderServerComponent(React.createElement(NotFoundPage));
    expect(await axe(container)).toHaveNoViolations();
    container.remove();
  });

  it("OfflinePage has no violations", async () => {
    const container = renderServerComponent(React.createElement(OfflinePage));
    expect(await axe(container)).toHaveNoViolations();
    container.remove();
  });
});

describe("Accessibility (axe) — Client Components", () => {
  it("Attribution component has no violations", async () => {
    const { container } = render(
      React.createElement(Attribution, { dataset: "koto-events" }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("ShareButton has no violations", async () => {
    const { container } = render(
      React.createElement(ShareButton, { title: "テストページ" }),
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it("EmergencyContactCard has no violations (collapsed)", async () => {
    const { container } = render(React.createElement(EmergencyContactCard));
    expect(await axe(container)).toHaveNoViolations();
  });

  it("EmergencyContactCard has no violations (expanded)", async () => {
    const { container, getByRole } = render(
      React.createElement(EmergencyContactCard),
    );
    fireEvent.click(getByRole("button", { name: /災害用伝言ダイヤル/ }));
    expect(getByRole("button").getAttribute("aria-expanded")).toBe("true");
    expect(await axe(container)).toHaveNoViolations();
  });

  it("EmergencyChecklist has no violations", async () => {
    const { container } = render(React.createElement(EmergencyChecklist));
    expect(await axe(container)).toHaveNoViolations();
  });
});
