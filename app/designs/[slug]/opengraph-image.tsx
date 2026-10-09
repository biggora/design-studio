import { ImageResponse } from "next/og";
import { getDesignById, getDesignBySlug, getSiteConfig } from "@/utils/database";
import { getDesignDisplayImage } from "@/lib/image";
import { SLUG_PATTERN, UUID_PATTERN } from "@/lib/slug";
import { BrandCard, DesignCard, OG_SIZE, fetchImageDataUrl, loadOgFonts, loadOgLogo } from "@/lib/og";

export const alt = "Design preview";
export const size = { width: 1200, height: 630 }; // keep equal to OG_SIZE (segment config must be a literal)
export const contentType = "image/png";
export const runtime = "nodejs";
export const revalidate = 86400;

// Same slug/UUID resolution as loadDesign in page.tsx.
async function resolveDesign(param: string) {
  if (UUID_PATTERN.test(param)) return getDesignById(param);
  if (param.length > 255 || !SLUG_PATTERN.test(param)) return null;
  return getDesignBySlug(param);
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const [data, config, fonts, logoDataUrl] = await Promise.all([
    resolveDesign(slug),
    getSiteConfig(),
    loadOgFonts(),
    loadOgLogo(),
  ]);
  const options = { ...OG_SIZE, fonts };

  if (!data?.design) {
    return new ImageResponse(
      <BrandCard siteName={config.name} intro={config.intro} description={config.description} domain={config.domain} logoDataUrl={logoDataUrl} />,
      options,
    );
  }

  const { design } = data;
  const imageDataUrl = await fetchImageDataUrl(getDesignDisplayImage(design).trim());
  return new ImageResponse(
    (
      <DesignCard
        title={design.title}
        description={design.description}
        siteName={config.name}
        domain={config.domain}
        label={design.collection || "Original design"}
        imageDataUrl={imageDataUrl}
        logoDataUrl={logoDataUrl}
      />
    ),
    options,
  );
}
