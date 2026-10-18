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

// Shared by the quick links and the social icons: Linen Mist at 70% hovering
// to full Linen Mist on the Thread Shadow band.
const bandLinkClasses =
  "text-primary-foreground/70 hover:text-primary-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-foreground";

const socialNetworks = [
  { key: "facebook", name: "Facebook", Icon: SiFacebook },
  { key: "twitter", name: "Twitter", Icon: SiX },
  { key: "instagram", name: "Instagram", Icon: SiInstagram },
  { key: "linkedin", name: "LinkedIn", Icon: SiLinkedin },
  { key: "pinterest", name: "Pinterest", Icon: SiPinterest },
] as const;

const quickLinks = [
  { href: "/designs", label: "Our Designs" },
  { href: "/collections", label: "Collections" },
  { href: "/gifts", label: "Gift Ideas" },
  { href: "/about", label: "About Us" },
  { href: "/privacy-policy", label: "Privacy Policy" },
  { href: "/terms-of-service", label: "Terms of Service" },
  { href: "/disclosure", label: "Affiliate Disclosure" },
] as const;

export default function Footer() {
  const config = useContext(ConfigContext);

  return (
    <footer className="bg-secondary text-primary-foreground">
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="w-full md:w-1/3 text-center md:text-left">
            <h3 className="text-lg font-semibold">{config.name}</h3>
            {config.tagline && (
              <p className="mt-2 text-sm text-primary-foreground/70">
                {config.tagline}
              </p>
            )}
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0">
            <h4 className="text-lg font-semibold mb-2">Quick Links</h4>
            <ul className="text-sm">
              {quickLinks.map(({ href, label }) => (
                <li key={href}>
                  <Link href={href} className={bandLinkClasses}>
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0 text-center md:text-right">
            <h4 className="text-lg font-semibold mb-2">Connect With Us</h4>
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
        <div className="mt-8 text-center text-sm text-primary-foreground/70">
          &copy; {new Date().getFullYear()} {config.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
