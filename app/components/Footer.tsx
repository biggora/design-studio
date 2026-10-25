"use client";

import Link from "next/link";
import {
  SiFacebook,
  SiX,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
} from "@icons-pack/react-simple-icons";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";
import { cn, focusRingClasses } from "@/lib/utils";
import { applyRedbubbleAffiliate, applyTeepublicReferral } from "@/lib/affiliate";
import { IconLink } from "@/app/components/IconLink";
import { BrandMark } from "@/app/components/BrandMark";

// Shared by every footer link: Bone at 70% hovering to full Bone on the
// Coal Deep band, the shared 2px ember focus ring on a soft plate. Nav
// rows add padding for 44px mobile / ≥24px desktop tap targets; inline
// text links (shop line, email) stay tight.
const bandLinkClasses = cn(
  "inline-block rounded-sm py-1",
  "text-primary-foreground/70 hover:text-primary-foreground transition-colors",
  focusRingClasses,
);
const paddedBandLinkClasses = cn(bandLinkClasses, "py-3 md:py-1.5");

const socialNetworks = [
  { key: "facebook", name: "Facebook", Icon: SiFacebook },
  { key: "twitter", name: "Twitter", Icon: SiX },
  { key: "instagram", name: "Instagram", Icon: SiInstagram },
  { key: "linkedin", name: "LinkedIn", Icon: SiLinkedin },
  { key: "pinterest", name: "Pinterest", Icon: SiPinterest },
] as const;

const exploreLinks = [
  { href: "/designs", label: "Our Designs" },
  { href: "/collections", label: "Collections" },
  { href: "/gifts", label: "Gift Ideas" },
] as const;

const companyLinks = [
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
] as const;

const legalLinks = [
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/disclosure", label: "Affiliate Disclosure" },
] as const;

function FooterLinkList({ heading, links }: { heading: string; links: ReadonlyArray<{ href: string; label: string }> }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-2">{heading}</h2>
      <ul className="text-sm">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href} className={paddedBandLinkClasses}>
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Footer() {
  const config = useContext(ConfigContext);

  // Canonical marketplace shop URLs from config, affiliate-wrapped at render
  // time (no-op while the affiliate templates are empty) — same sources and
  // sponsored flags as the contact page's ShopLinks. Tostadora has no
  // affiliate program. Only configured shops render.
  const shops = [
    {
      label: "Redbubble",
      href: config.representation.redbuble
        ? applyRedbubbleAffiliate(
            config.representation.redbuble,
            config.affiliate.redbubbleTemplate,
          )
        : "",
      sponsored: true,
    },
    {
      label: "TeePublic",
      href:
        applyTeepublicReferral(
          config.representation.teepublic || null,
          config.affiliate.teepublicReferralId,
        ) || "",
      sponsored: true,
    },
    {
      label: "Tostadora",
      href: config.representation.tostadora || config.representation.tostaDora || "",
      sponsored: false,
    },
  ].filter((shop) => shop.href);

  return (
    <footer className="bg-secondary text-primary-foreground pb-[var(--mobile-buy-bar-space,0px)] md:pb-0">
      <div className="container mx-auto px-6 pt-16 pb-10 md:pb-16">
        <div className="grid grid-cols-2 gap-x-8 gap-y-10 items-start md:grid-cols-4 lg:grid-cols-12">
          <div className="col-span-2 md:col-span-1 lg:col-span-4">
            <p className="flex items-center gap-2.5 text-lg font-semibold">
              <BrandMark siteLogo={config.siteLogo} name={config.name} className="h-7 w-7" />
              {config.name}
            </p>
            {config.tagline && (
              <p className="mt-2 text-sm text-primary-foreground/70">
                {config.tagline}
              </p>
            )}
            {shops.length > 0 && (
              <p className="mt-2 text-sm text-primary-foreground/70">
                Our shops:{" "}
                {shops.map((shop, index) => (
                  <span key={shop.label}>
                    {index > 0 && " · "}
                    <a
                      href={shop.href}
                      target="_blank"
                      rel={
                        shop.sponsored
                          ? "sponsored noopener noreferrer"
                          : "noopener noreferrer"
                      }
                      className={bandLinkClasses}
                    >
                      {shop.label} <span aria-hidden="true">&#8599;</span>
                    </a>
                  </span>
                ))}
              </p>
            )}
          </div>
          <nav aria-label="Footer" className="col-span-2 md:col-span-2 lg:col-span-4">
            <div className="grid grid-cols-2 gap-x-8">
              <FooterLinkList heading="Explore" links={exploreLinks} />
              <FooterLinkList heading="Company" links={companyLinks} />
            </div>
          </nav>
          <div className="col-span-2 md:col-span-1 lg:col-span-4">
            <h2 className="text-lg font-semibold mb-2">Connect With Us</h2>
            <div className="flex space-x-4">
              {socialNetworks.map(({ key, name, Icon }) => {
                const href = config.social?.[key];
                return href ? (
                  <IconLink key={key} href={href} label={name} variant="band">
                    <Icon size={24} />
                  </IconLink>
                ) : null;
              })}
            </div>
          </div>
        </div>
        <div className="mt-8 flex flex-col items-start gap-3 border-t border-border pt-4 text-sm text-primary-foreground/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
            <p>&copy; {new Date().getFullYear()} {config.name}. All rights reserved.</p>
            {config.email && (
              <a href={`mailto:${config.email}`} className={bandLinkClasses}>
                {config.email}
              </a>
            )}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={paddedBandLinkClasses}>
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </footer>
  );
}
