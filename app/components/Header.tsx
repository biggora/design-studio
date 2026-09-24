"use client";

import Link from "next/link";
import { useContext, useState } from "react";
import { Menu, X } from "lucide-react";
import { ConfigContext } from "@/app/wrapper";

export default function Header() {
  const config = useContext(ConfigContext);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-primary/80 text-primary-foreground shadow-md fixed w-full z-10">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="text-2xl font-bold text-primary-foreground">
            {config.name}
          </Link>
          <nav className="hidden md:flex space-x-6">
            <Link
              href="/"
              className="text-primary-foreground hover:text-primary-foreground/70 transition-colors"
            >
              Home
            </Link>
            <Link
              href="/designs"
              className="text-primary-foreground hover:text-primary-foreground/70 transition-colors"
            >
              Our Designs
            </Link>
            <Link
              href="/about"
              className="text-primary-foreground hover:text-primary-foreground/70 transition-colors"
            >
              About Us
            </Link>
            <Link
              href="/contact"
              className="text-primary-foreground hover:text-primary-foreground/70 transition-colors"
            >
              Contact
            </Link>
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
            <Link
              href="/"
              className="block text-primary-foreground hover:text-primary-foreground/70 transition-colors"
              onClick={toggleMenu}
            >
              Home
            </Link>
            <Link
              href="/designs"
              className="block text-primary-foreground hover:text-primary-foreground/70 transition-colors"
              onClick={toggleMenu}
            >
              Our Designs
            </Link>
            <Link
              href="/about"
              className="block text-primary-foreground hover:text-primary-foreground/70 transition-colors"
              onClick={toggleMenu}
            >
              About Us
            </Link>
            <Link
              href="/contact"
              className="block text-primary-foreground hover:text-primary-foreground/70 transition-colors"
              onClick={toggleMenu}
            >
              Contact
            </Link>
          </div>
        </nav>
      )}
    </header>
  );
}
