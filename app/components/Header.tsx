"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { ConfigContext } from "@/app/wrapper";
import { BrandMark } from "@/app/components/BrandMark";
import { cn, focusRingClasses } from "@/lib/utils";

export default function Header() {
  const config = useContext(ConfigContext);
  const navItems = [
    { href: "/designs", label: "Our Designs" },
    { href: "/collections", label: "Collections" },
    { href: "/gifts", label: "Gift Ideas" },
    { href: "/articles", label: config.articles?.label || "Articles" },
    { href: "/about", label: "About Us" },
    { href: "/services", label: "Services" },
    { href: "/contact", label: "Contact" },
  ] as const;
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // The open panel is fully opaque and locks body scroll, so page content
  // never bleeds through the primary navigation.
  useEffect(() => {
    if (!isMenuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isMenuOpen]);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClassName = (href: string) =>
    cn(
      focusRingClasses,
      "transition-colors",
      isActive(href)
        ? "font-semibold text-primary-foreground"
        : "text-primary-foreground/70 hover:text-accent",
    );

  return (
    <header className="bg-primary/90 text-primary-foreground shadow-md fixed w-full z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2.5 font-display text-xl font-bold text-primary-foreground rounded-md",
              focusRingClasses,
            )}
          >
            <BrandMark siteLogo={config.siteLogo} name={config.name} />
            {config.name}
          </Link>
          <nav className="hidden lg:flex space-x-6">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={linkClassName(href)}
              >
                {label}
              </Link>
            ))}
          </nav>
          <div className="lg:hidden">
            <button
              onClick={toggleMenu}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              className={cn("text-primary-foreground hover:text-primary-foreground/70", focusRingClasses)}
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {isMenuOpen && (
        <nav className="lg:hidden bg-primary">
          <div className="container mx-auto px-4 py-4 space-y-4">
            {navItems.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={`block ${linkClassName(href)}`}
                onClick={toggleMenu}
              >
                {label}
              </Link>
            ))}
          </div>
        </nav>
      )}
    </header>
  );
}
