import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_THEME_COLOR } from "@/config/site";
import { messages } from "@/lib/i18n/messages";
import {
  shouldEmitDevSwKill,
  DEV_SW_KILL_SCRIPT,
} from "@/lib/dev-sw-kill";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://example.com";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_TITLE,
    images: [
      {
        url: `${BASE_URL}/api/og`,
        width: 1200,
        height: 630,
        alt: SITE_TITLE,
      },
    ],
    locale: "ja_JP",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [`${BASE_URL}/api/og`],
  },
};

export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read nonce set by middleware for CSP nonce injection into inline scripts.
  const headersList = await headers();
  const nonce = headersList.get("x-nonce") ?? undefined;

  const emitKill = shouldEmitDevSwKill(process.env.NODE_ENV ?? "development");

  if (emitKill && !nonce) {
    console.warn(
      "[my-koto dev] CSP nonce missing; SW kill bootstrap skipped — verify middleware.ts"
    );
  }

  return (
    // data-nonce exposes the per-request nonce for any inline scripts that require it.
    <html lang="ja" suppressHydrationWarning {...(nonce ? { "data-nonce": nonce } : {})}>
      <head>
        {emitKill && nonce && (
          // suppressHydrationWarning: React 19 strips the nonce attribute on
          // the client during hydration to prevent script-injection chaining,
          // so the SSR'd `nonce="..."` always mismatches the empty client-side
          // value. The script body itself is identical, and CSP enforcement
          // happens server-side, so the warning is benign.
          <script
            nonce={nonce}
            suppressHydrationWarning
            dangerouslySetInnerHTML={{ __html: DEV_SW_KILL_SCRIPT }}
          />
        )}
        {/* Required for CC-BY 4.0 compliance: machine-readable license declaration */}
        <link rel="license" href="https://creativecommons.org/licenses/by/4.0/deed.ja" />
      </head>
      <body className="min-h-screen flex flex-col bg-white text-gray-900">
        <main className="flex-1">{children}</main>
        <footer className="border-t border-gray-200 bg-gray-50 py-6 px-4 text-sm text-gray-600">
          <div className="max-w-4xl mx-auto space-y-2">
            <p className="font-medium text-gray-800">{messages.footer.disclaimer}</p>
            <p>{messages.footer.attribution}</p>
            <p>
              ライセンス:{" "}
              <a
                href={messages.footer.licenseUrl}
                className="underline hover:text-gray-900"
                target="_blank"
                rel="noopener noreferrer"
              >
                {messages.footer.licenseLabel}
              </a>
            </p>
            <nav className="flex gap-4 pt-2 text-xs">
              <a href="/about" className="underline hover:text-gray-900">
                {messages.nav.about}
              </a>
              <a href="/privacy" className="underline hover:text-gray-900">
                {messages.nav.privacy}
              </a>
              <a href="/disclaimer" className="underline hover:text-gray-900">
                {messages.nav.disclaimer}
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
