"use client";

import { useState } from "react";

type ShareButtonProps = {
  title: string;
  url?: string;
};

/**
 * Web Share API button with clipboard fallback.
 * Shares title + URL only (omits `files` for iOS compatibility).
 */
export default function ShareButton({ title, url }: ShareButtonProps) {
  const [toastVisible, setToastVisible] = useState(false);

  async function handleShare() {
    const shareUrl = url ?? (typeof window !== "undefined" ? window.location.href : "");

    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await navigator.share({ title, url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed — fall through to clipboard copy.
      }
    }

    // Clipboard fallback
    try {
      await navigator.clipboard.writeText(shareUrl);
      setToastVisible(true);
      setTimeout(() => setToastVisible(false), 2500);
    } catch {
      // Clipboard write also unavailable — silent failure.
    }
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        type="button"
        onClick={handleShare}
        aria-label={`「${title}」のURLを共有する`}
        className="inline-flex items-center gap-1.5 rounded border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
      >
        <svg
          aria-hidden="true"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="18" cy="5" r="3" />
          <circle cx="6" cy="12" r="3" />
          <circle cx="18" cy="19" r="3" />
          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
        </svg>
        共有
      </button>

      {toastVisible && (
        <div
          role="status"
          aria-live="polite"
          className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded bg-gray-800 px-3 py-1.5 text-xs text-white shadow"
        >
          URLをコピーしました
        </div>
      )}
    </div>
  );
}
