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
import { IconLink } from "@/app/components/IconLink";
import { SectionHeading } from "@/app/components/SectionHeading";

const socialNetworks = [
  { key: "facebook", name: "Facebook", Icon: SiFacebook },
  { key: "twitter", name: "Twitter", Icon: SiX },
  { key: "instagram", name: "Instagram", Icon: SiInstagram },
  { key: "linkedin", name: "LinkedIn", Icon: SiLinkedin },
  { key: "pinterest", name: "Pinterest", Icon: SiPinterest },
] as const;

export default function SocialLinks() {
  const config = useContext(ConfigContext);

  return (
    <>
      <SectionHeading>Connect With Us</SectionHeading>
      <div className="flex justify-start space-x-4 mb-4">
        {socialNetworks.map(({ key, name, Icon }) => {
          const href = config.social?.[key];
          return href ? (
            <IconLink key={key} href={href} label={name}>
              <Icon size={24} />
            </IconLink>
          ) : null;
        })}
      </div>
    </>
  );
}
