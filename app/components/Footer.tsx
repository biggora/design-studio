import Link from 'next/link'

export default function Footer() {
  return (
    <footer className="bg-[#2E3944] text-[#D3D9D4]">
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="w-full md:w-1/3 text-center md:text-left">
            <h3 className="text-lg font-semibold">ThreadQuirk</h3>
            <p className="mt-2 text-sm text-[#748D92]">Innovative designs that weave stories.</p>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0">
            <h4 className="text-lg font-semibold mb-2">Quick Links</h4>
            <ul className="text-sm">
              <li><Link href="/privacy-policy" className="text-[#748D92] hover:text-[#D3D9D4] transition-colors">Privacy Policy</Link></li>
              <li><Link href="/terms-of-service" className="text-[#748D92] hover:text-[#D3D9D4] transition-colors">Terms of Service</Link></li>
            </ul>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0 text-center md:text-right">
            <h4 className="text-lg font-semibold mb-2">Connect With Us</h4>
            <div className="flex justify-center md:justify-end space-x-4">
              {/* Add social media icons/links here */}
            </div>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-[#748D92]">
          &copy; {new Date().getFullYear()} ThreadQuirk. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

