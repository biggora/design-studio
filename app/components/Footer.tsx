import Link from "next/link";
import {
  SiFacebook,
  SiX,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
} from "@icons-pack/react-simple-icons";
import companyData from "@/config/company.json";

export default function Footer() {
  return (
    <footer className="bg-[#2E3944] text-[#D3D9D4]">
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="w-full md:w-1/3 text-center md:text-left">
            <h3 className="text-lg font-semibold">{companyData.name}</h3>
            <p className="mt-2 text-sm text-[#748D92]">
              Innovative designs that weave stories.
            </p>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0">
            <h4 className="text-lg font-semibold mb-2">Quick Links</h4>
            <ul className="text-sm">
              <li>
                <Link
                  href="/privacy-policy"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/terms-of-service"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  Terms of Service
                </Link>
              </li>
            </ul>
          </div>
          <div className="w-full md:w-1/3 mt-4 md:mt-0 text-center md:text-right">
            <h4 className="text-lg font-semibold mb-2">Connect With Us</h4>
            <div className="flex justify-center md:justify-end space-x-4">
              <a
                href={
                  companyData.social.facebook
                    ? companyData.social.facebook
                    : "https://facebook.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
              >
                <SiFacebook size={24} />
                <span className="sr-only">Facebook</span>
              </a>
              <a
                href={
                  companyData.social.twitter
                    ? companyData.social.twitter
                    : "https://twitter.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
              >
                <SiX size={24} />
                <span className="sr-only">Twitter</span>
              </a>
              <a
                href={
                  companyData.social.instagram
                    ? companyData.social.instagram
                    : "https://instagram.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
              >
                <SiInstagram size={24} />
                <span className="sr-only">Instagram</span>
              </a>
              <a
                href={
                  companyData.social.linkedin
                    ? companyData.social.linkedin
                    : "https://linkedin.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
              >
                <SiLinkedin size={24} />
                <span className="sr-only">LinkedIn</span>
              </a>
              <a
                href={
                  companyData.social.pinterest
                    ? companyData.social.pinterest
                    : "https://pinterest.com"
                }
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
              >
                <SiPinterest size={24} />
                <span className="sr-only">Pinterest</span>
              </a>
            </div>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-[#748D92]">
          &copy; {new Date().getFullYear()} {companyData.name}. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
