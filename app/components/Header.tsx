"use client";

import Link from "next/link";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

export default function Header() {
  const config = useContext(ConfigContext);

  return (
    <header className="bg-[#212A31] bg-opacity-80 text-[#D3D9D4] shadow-md fixed w-full z-10 h-16">
      <nav className="container mx-auto px-6 h-full flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-[#D3D9D4]">
          {config.name}
        </Link>
        <div className="flex space-x-6">
          <Link
            href="/"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            Home
          </Link>
          <Link
            href="/designs"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            Our Designs
          </Link>
          <Link
            href="/about"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            About Us
          </Link>
          <Link
            href="/contact"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            Contact
          </Link>
        </div>
      </nav>
    </header>
  );
}
