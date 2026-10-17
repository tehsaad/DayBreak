"use client";

import { createContext, useContext, useState } from "react";
import { Loader2 } from "lucide-react";

const PendingContext = createContext(false);

/**
 * A native HTML form (posts to a route handler, works without JavaScript) that shows a pending
 * state once submitted. The browser navigates away on the response, so the state never resets.
 */
export function PendingForm({ action, children, className }: { action: string; children: React.ReactNode; className?: string }) {
  const [pending, setPending] = useState(false);
  return (
    <form action={action} method="post" className={className} onSubmit={() => setPending(true)}>
      <PendingContext.Provider value={pending}>{children}</PendingContext.Provider>
    </form>
  );
}

export function SubmitButton({ children, pendingLabel, variant = "primary" }: { children: React.ReactNode; pendingLabel: string; variant?: "primary" | "ghost" }) {
  const pending = useContext(PendingContext);
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={`btn ${variant === "primary" ? "btn-primary w-full justify-center !py-2.5" : "btn-ghost"}`}>
      {pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : null}
      {pending ? pendingLabel : children}
    </button>
  );
}
