import type { Metadata, Viewport } from "next";
import "./globals.css";
import { SITE_TITLE, SITE_DESCRIPTION, SITE_THEME_COLOR } from "@/config/site";
import { messages } from "@/lib/i18n/messages";

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
};

export const viewport: Viewport = {
  themeColor: SITE_THEME_COLOR,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <head>
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
