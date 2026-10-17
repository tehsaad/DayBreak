"use client";

import { useState } from "react";
import { safeImageUrl } from "@/lib/security/url";

const SIZES = {
  lead: "aspect-[16/9] w-full",
  feature: "aspect-[3/2] w-full",
  thumb: "aspect-[4/3] w-24 sm:w-28",
  small: "aspect-square w-16",
} as const;

/**
 * Editorial thumbnail from the publisher's own feed image. Space is reserved up front (fixed
 * aspect ratio), images below the fold load lazily, and missing, blocked or broken images
 * become a consistent newspaper-style placeholder instead of a broken icon.
 */
export function Thumb({
  src,
  alt,
  size = "thumb",
  label,
  priority = false,
  className = "",
}: {
  src: string | null | undefined;
  alt: string;
  size?: keyof typeof SIZES;
  /** Short section label shown in the placeholder. */
  label: string;
  priority?: boolean;
  className?: string;
}) {
  const url = safeImageUrl(src);
  const [failed, setFailed] = useState(false);
  const show = url && !failed;
  return (
    // self-start: inside flex rows the box would otherwise stretch to the row's height and lose its aspect ratio.
    <div className={`relative shrink-0 self-start overflow-hidden bg-paper-deep ${SIZES[size]} ${className}`} data-thumb={show ? "image" : "placeholder"}>
      {show ? (
        // Publisher images come from many feed hosts; rendered directly (never proxied or re-hosted).
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={url}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : "auto"}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.03]"
        />
      ) : (
        <div aria-hidden className="absolute inset-0 flex flex-col items-center justify-center border border-rule bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgba(27,26,23,0.035)_6px,rgba(27,26,23,0.035)_7px)]">
          <span className="font-display text-[0.65rem] font-bold uppercase tracking-[0.2em] text-muted">{label}</span>
          <span className="mt-1 h-px w-6 bg-rule" />
        </div>
      )}
    </div>
  );
}
