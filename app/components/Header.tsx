import Link from "next/link";
import companyData from "@/config/company.json";

export default function Header() {
  return (
    <header className="bg-[#212A31] bg-opacity-80 text-[#D3D9D4] shadow-md fixed w-full z-10 h-16">
      <nav className="container mx-auto px-6 h-full flex items-center justify-between">
        <Link href="/" className="text-2xl font-bold text-[#D3D9D4]">
          {companyData.name}
        </Link>
        <div className="flex space-x-6">
          <Link
            href="/"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            Home
          </Link>
          <Link
            href="/prints"
            className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"
          >
            Our Prints
          </Link>
          {/*<Link*/}
          {/*  href="/services"*/}
          {/*  className="text-[#D3D9D4] hover:text-[#748D92] transition-colors"*/}
          {/*>*/}
          {/*  Services*/}
          {/*</Link>*/}
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
