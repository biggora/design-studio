"use client";

import type { ReactNode } from "react";
import { sendGAEvent } from "@next/third-parties/google";

export type BuyLinkProps = {
  href: string;
  platform: "redbubble" | "teepublic";
  designSlug: string;
  pageType: "design" | "landing";
  position: "primary" | "secondary";
  className?: string;
  children?: ReactNode;
};

/**
 * The marketplace "Buy" link as a client island: it renders the same <a> as
 * before and, on click, fires one GA4 `buy_click` event so promotion channels
 * (Pinterest referrals etc.) can be compared per design. The handler never
 * prevents navigation and never throws — when GA is not loaded (no consent
 * yet, declined, or an ad blocker) the click is simply not recorded.
 */
export default function BuyLink({
  href,
  platform,
  designSlug,
  pageType,
  position,
  className,
  children,
}: BuyLinkProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="sponsored noopener noreferrer"
      className={className}
      onClick={() => {
        try {
          sendGAEvent("event", "buy_click", {
            platform,
            design_slug: designSlug,
            page_type: pageType,
            position,
          });
        } catch {
          // Analytics must never get in the way of the buy link.
        }
      }}
    >
      {children}
    </a>
  );
}
