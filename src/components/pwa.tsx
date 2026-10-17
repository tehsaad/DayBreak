"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";

const DISMISS_KEY = "daybreak.installDismissedAt";
const DISMISS_DAYS = 14;

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function recentlyDismissed(): boolean {
  try {
    const at = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
    return Date.now() - at < DISMISS_DAYS * 86400_000;
  } catch {
    return false;
  }
}

const noop = () => () => {};
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/**
 * Registers the service worker and offers installation:
 *  - Chrome/Edge/Android: an Install button, only after the browser fires `beforeinstallprompt`
 *    (browsers decide eligibility; we never promise a native popup).
 *  - iOS Safari: short "Share → Add to Home Screen" instructions.
 * Dismissing hides the offer for two weeks on this device.
 */
export function PwaInstall() {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const ios = useSyncExternalStore(noop, () => isIos() && !isStandalone() && !recentlyDismissed(), () => false);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      const v = process.env.NEXT_PUBLIC_APP_VERSION ?? "dev";
      navigator.serviceWorker.register(`/sw.js?v=${encodeURIComponent(v)}`).catch(() => undefined);
    }
    const onPrompt = (e: Event) => {
      e.preventDefault();
      if (!recentlyDismissed() && !isStandalone()) setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* optional */
    }
    setDismissed(true);
    setDeferred(null);
  };

  if (dismissed || (!deferred && !ios)) return null;
  return (
    <div role="region" aria-label="Install DAYBREAK" className="no-print fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-md items-start gap-3 border border-ink bg-paper-card p-3 font-sans text-sm shadow-lg sm:inset-x-auto sm:right-4">
      <div className="flex-1">
        <p className="font-semibold">Read DAYBREAK like an app</p>
        {deferred ? (
          <p className="mt-0.5 text-xs text-muted">Install it for a full-screen paper on your home screen.</p>
        ) : (
          <p className="mt-0.5 text-xs text-muted">
            In Safari, tap <Share size={12} aria-label="Share" className="inline align-[-1px]" /> then <strong>Add to Home Screen</strong>.
          </p>
        )}
      </div>
      {deferred ? (
        <button
          type="button"
          className="btn btn-primary !py-1.5"
          onClick={async () => {
            await deferred.prompt();
            await deferred.userChoice.catch(() => undefined);
            setDeferred(null);
          }}
        >
          <Download size={14} aria-hidden /> Install
        </button>
      ) : null}
      <button type="button" aria-label="Not now" onClick={dismiss} className="rounded p-1 text-muted hover:bg-paper-deep hover:text-ink">
        <X size={16} aria-hidden />
      </button>
    </div>
  );
}
