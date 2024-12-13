"use client";

import {
  SiFacebook,
  SiInstagram,
  SiLinkedin,
  SiPinterest,
  SiX,
} from "@icons-pack/react-simple-icons";
import { useContext } from "react";
import { ConfigContext } from "@/app/wrapper";

export default function SocialLinks() {
  const config = useContext(ConfigContext);

  return (
    <>
      <h2 className="text-2xl font-semibold mb-4 text-[#212A31]">
        Connect With Us
      </h2>
      <div className="flex justify-left space-x-4 mb-4">
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
    </>
  );
}
