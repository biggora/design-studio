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
import { IconLink } from "@/app/components/IconLink";
import { BrandMark } from "@/app/components/BrandMark";

// Shared by every footer link: Bone at 70% hovering to full Bone on the
// Coal Deep band.
const bandLinkClasses =
  "text-primary-foreground/70 hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground";

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
    <footer className="bg-secondary text-primary-foreground">
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="w-full md:w-1/3 text-center md:text-left">
            <p className="flex items-center justify-center gap-2.5 md:justify-start text-lg font-semibold">
              <BrandMark siteLogo={config.siteLogo} name={config.name} className="h-7 w-7" />
              {config.name}
            </p>
            {config.tagline && (
              <p className="mt-2 text-sm text-primary-foreground/70">
                {config.tagline}
              </p>
            )}
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0">
            <div className="grid grid-cols-2 gap-x-8">
              <FooterLinkList heading="Explore" links={exploreLinks} />
              <FooterLinkList heading="Company" links={companyLinks} />
            </div>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0 text-center md:text-right">
            <h2 className="text-lg font-semibold mb-2">Connect With Us</h2>
            <div className="flex justify-center md:justify-end space-x-4">
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
        <div className="mt-8 flex flex-col items-center gap-3 border-t border-border pt-4 text-sm text-primary-foreground/70 sm:flex-row sm:justify-between">
          <p>&copy; {new Date().getFullYear()} {config.name}. All rights reserved.</p>
          <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2">
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
