"use client";

// Single client-component boundary that groups the home-page banners.
//
// Both banners are Client Components but importing them individually
// from the Server Component page exposed a Next 15 dev-mode bundling
// race ("Cannot read properties of undefined (reading 'call')") on
// soft navigations back to home. Wrapping them in one "use client"
// module collapses the RSC client-references to a single entry and
// avoids the per-banner chunk hand-off.

import JmaQuakeBanner from "./JmaQuakeBanner";
import JmaWarningBanner from "./JmaWarningBanner";

export default function HomeBanners() {
  return (
    <>
      <JmaWarningBanner />
      <JmaQuakeBanner />
    </>
  );
}
