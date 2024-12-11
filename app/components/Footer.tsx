"use client";

import Link from "next/link";
import {
  SiFacebook,
  SiX,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
} from "@icons-pack/react-simple-icons";
import { useSiteConfigStore } from "@/lib/store";

export default function Footer() {
  const { config } = useSiteConfigStore();

  return (
    <footer className="bg-[#2E3944] text-[#D3D9D4]">
      <div className="container mx-auto px-6 py-4">
        <div className="flex flex-wrap justify-between items-center">
          <div className="w-full md:w-1/3 text-center md:text-left">
            <h3 className="text-lg font-semibold">{config.name}</h3>
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
              {config.social.facebook && (
                <a
                  href={config.social.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  <SiFacebook size={24} />
                  <span className="sr-only">Facebook</span>
                </a>
              )}
              {config.social.twitter && (
                <a
                  href={config.social.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  <SiX size={24} />
                  <span className="sr-only">Twitter</span>
                </a>
              )}
              {config.social.instagram && (
                <a
                  href={config.social.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  <SiInstagram size={24} />
                  <span className="sr-only">Instagram</span>
                </a>
              )}
              {config.social.linkedin && (
                <a
                  href={config.social.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  <SiLinkedin size={24} />
                  <span className="sr-only">LinkedIn</span>
                </a>
              )}
              {config.social.pinterest && (
                <a
                  href={config.social.pinterest}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#748D92] hover:text-[#D3D9D4] transition-colors"
                >
                  <SiPinterest size={24} />
                  <span className="sr-only">Pinterest</span>
                </a>
              )}
            </div>
          </div>
        </div>
        <div className="mt-8 text-center text-sm text-[#748D92]">
          &copy; {new Date().getFullYear()} {config.name}. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
