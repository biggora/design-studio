import { renderOg, validateJpeg } from "@pod/og-renderer";
import type { OgImage, Role } from "@pod/og-renderer/contract";
import { isAllowedPinSourceImage } from "@/lib/pin-image";

import { readImageResponse } from "@/lib/pinterest-image-response";

export async function assignedOgResponse(
  image: OgImage,
): Promise<{ bytes: Uint8Array; cloud: boolean }> {
  const base = process.env.NEXT_PUBLIC_IMAGES_CDN?.replace(/\/+$/, "");
  if (image.asset && base) {
    try {
      const url = `${base}/${image.asset.key}`;
      if (!isAllowedPinSourceImage(url)) throw new Error("Invalid CDN URL");
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      const bytes = await readImageResponse(response, 1024 * 1024);
      await validateJpeg(bytes, image.asset);
      return { bytes, cloud: true };
    } catch {
      /* The saved composition is the fallback, never a newly chosen template. */
    }
  }
  const images: Partial<Record<Role, Uint8Array>> = {};
  await Promise.all(
    image.assignment.sources.map(async (source) => {
      if (!isAllowedPinSourceImage(source.url))
        throw new Error("Invalid product source");
      const response = await fetch(source.url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      });
      images[source.role] = await readImageResponse(response, 12 * 1024 * 1024);
    }),
  );
  return {
    bytes: new Uint8Array(await renderOg(image.assignment, images)),
    cloud: false,
  };
}
