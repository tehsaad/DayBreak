"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
}

export function OfflineBanner() {
  const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);
  if (online) return null;
  return (
    <div role="status" className="no-print bg-warn-soft px-4 py-2 text-center font-sans text-sm text-warn">
      You&apos;re offline. Pages you&apos;ve opened stay readable; saving, feedback and new editions will work again when you reconnect.
    </div>
  );
}
