"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useContext, useState } from "react";
import { Menu, X } from "lucide-react";
import { ConfigContext } from "@/app/wrapper";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/designs", label: "Our Designs" },
  { href: "/about", label: "About Us" },
  { href: "/services", label: "Services" },
  { href: "/contact", label: "Contact" },
] as const;

export default function Header() {
  const config = useContext(ConfigContext);
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const linkClassName = (href: string) =>
    `${
      isActive(href)
        ? "font-semibold text-primary-foreground"
        : "text-primary-foreground/70 hover:text-primary-foreground"
    } transition-colors`;

  return (
    <header className="bg-primary/80 text-primary-foreground shadow-md fixed w-full z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-2xl font-bold text-primary-foreground">
            {config.name}
          </Link>
          <nav className="hidden md:flex space-x-6">
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
          <div className="md:hidden">
            <button
              onClick={toggleMenu}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
              aria-expanded={isMenuOpen}
              className="text-primary-foreground hover:text-primary-foreground/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>
      </div>
      {/* Mobile menu */}
      {isMenuOpen && (
        <nav className="md:hidden bg-primary/95">
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
