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
import { IconLink } from "@/app/components/IconLink";
import { BrandMark } from "@/app/components/BrandMark";

// Shared by every footer link: Bone at 70% hovering to full Bone on the
// Coal Deep band, the shared 2px ember focus ring on a soft plate, and
// padding that keeps the tap target at 44px on mobile (chip language)
// and ≥24px on desktop.
const bandLinkClasses = cn(
  "inline-block rounded-sm py-3 md:py-1.5",
  "text-primary-foreground/70 hover:text-primary-foreground transition-colors",
  focusRingClasses,
);

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
            <Link href={href} className={bandLinkClasses}>
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
          <p>&copy; {new Date().getFullYear()} {config.name}. All rights reserved.</p>
          <ul className="flex flex-wrap gap-x-5 gap-y-2">
            {legalLinks.map(({ href, label }) => (
              <li key={href}>
                <Link href={href} className={bandLinkClasses}>
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
