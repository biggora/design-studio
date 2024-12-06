import Link from "next/link";

export default function Header() {
  return (
    <header className="bg-[#212A31] text-[#D3D9D4] shadow-md">
      <nav className="container mx-auto px-6 py-3">
        <div className="flex justify-between items-center">
          <Link href="/" className="text-2xl font-bold text-[#D3D9D4]">
            ThreadQuirk
          </Link>
          <div className="flex space-x-4">
            <Link
              href="/"
              className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
            >
              Home
            </Link>
            <Link
              href="/about"
              className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
            >
              About
            </Link>
            <Link
              href="/portfolio"
              className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
            >
              Portfolio
            </Link>
            <Link
              href="/services"
              className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
            >
              Services
            </Link>
            <Link
              href="/contact"
              className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
            >
              Contact
            </Link>
          </div>
        </div>
      </nav>
    </header>
  );
}
