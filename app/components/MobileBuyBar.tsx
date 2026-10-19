"use client";

import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import BuyLink from "@/app/components/BuyLink";

type MobileBuyBarProps = {
  href: string;
  designSlug: string;
};

/**
 * Mobile-only sticky buy bar for the design detail page: the marketplace CTA
 * stays reachable from anywhere below the first screen. It appears after the
 * visitor scrolls past the top and hides while the in-card CTA
 * (`[data-in-card-buy]`) is on screen, so the two never compete. Parks above
 * the cookie banner (`[data-cookie-banner]`) while it is up. Desktop keeps
 * the two-column layout where the CTA is always in view.
 */
export function MobileBuyBar({ href, designSlug }: MobileBuyBarProps) {
  const [pastFirstScreen, setPastFirstScreen] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);
  const [bannerHeight, setBannerHeight] = useState(0);

  useEffect(() => {
    const onScroll = () => setPastFirstScreen(window.scrollY > 240);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const target = document.querySelector("[data-in-card-buy]");
    if (!target) return;
    const observer = new IntersectionObserver(
      ([entry]) => setCtaVisible(entry.isIntersecting),
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);

  // Park above the cookie banner while it is mounted (it renders after
  // hydration and disappears once a choice is stored).
  useEffect(() => {
    const update = () => {
      const banner = document.querySelector<HTMLElement>("[data-cookie-banner]");
      setBannerHeight(banner ? banner.offsetHeight : 0);
    };
    update();
    const timeout = window.setTimeout(update, 1200);
    const observer = new MutationObserver(update);
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("resize", update);
    return () => {
      window.clearTimeout(timeout);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);

  const visible = pastFirstScreen && !ctaVisible;

  return (
    <div
      aria-hidden={!visible}
      className={cn(
        "fixed inset-x-0 z-40 md:hidden transition-opacity duration-200",
        visible ? "opacity-100" : "pointer-events-none opacity-0",
      )}
      style={{ bottom: bannerHeight }}
    >
      <div
        className="border-t border-border bg-primary/95 px-4 pt-2 shadow-lg"
        style={{ paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))" }}
      >
        <BuyLink
          href={href}
          platform="redbubble"
          designSlug={designSlug}
          pageType="design"
          position="sticky"
          className={buttonVariants({ className: "w-full gap-2 min-h-11" })}
        >
          Buy on Redbubble
          <span aria-hidden="true">&#8599;</span>
        </BuyLink>
      </div>
    </div>
  );
}
