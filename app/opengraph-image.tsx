import { ImageResponse } from "next/og";
import { getSiteConfig } from "@/utils/database";
import { BrandCard, OG_SIZE, loadOgFonts, loadOgLogo } from "@/lib/og";

export const alt = "Site preview";
export const size = { width: 1200, height: 630 }; // keep equal to OG_SIZE (segment config must be a literal)
export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 86400;

export default async function Image() {
  const [config, fonts, logoDataUrl] = await Promise.all([getSiteConfig(), loadOgFonts(), loadOgLogo()]);
  return new ImageResponse(
    <BrandCard siteName={config.name} intro={config.intro} description={config.description} domain={config.domain} logoDataUrl={logoDataUrl} />,
    { ...OG_SIZE, fonts },
  );
}
