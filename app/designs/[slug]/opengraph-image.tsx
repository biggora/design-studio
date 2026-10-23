import { ImageResponse } from "next/og";
import { getDesignById, getDesignBySlug, getSiteConfig } from "@/utils/database";
import { getShareImageUrl } from "@/lib/image";
import { SLUG_PATTERN, UUID_PATTERN } from "@/lib/slug";
import { DesignCard, OG_SIZE, fetchImageDataUrl, loadOgFonts, loadOgLogo } from "@/lib/og";
import { assignedOgResponse } from "@/lib/og-image-response";

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
  const data = await resolveDesign(slug);
  if (!data?.design) return new Response(null, {status: 404, headers: {"Cache-Control": "no-store"}});
  const { design } = data;
  if (design.ogImage) {
    try {
      const result = await assignedOgResponse(design.ogImage);
      return new Response(new Uint8Array(result.bytes), {headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": result.cloud
          ? "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
          : "public, max-age=60, s-maxage=60",
      }});
    } catch (error) {
      console.error("Saved OG image unavailable", design.id, error);
      return new Response(null, {status: 503, headers: {"Cache-Control": "no-store"}});
    }
  }
  const [config, fonts, logoDataUrl] = await Promise.all([
    getSiteConfig(),
    loadOgFonts(),
    loadOgLogo(),
  ]);
  const options = { ...OG_SIZE, fonts };

  // The share image: the CDN's pre-flattened JPEG when published (satori cannot
  // decode the transparent WebP variants), else the Redbubble display image.
  const imageDataUrl = await fetchImageDataUrl(getShareImageUrl(design));
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
