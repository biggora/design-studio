import { renderPin, validateJpeg } from "@pod/pinterest-renderer";
import type { PinterestImage, Role } from "@pod/pinterest-renderer/contract";
import { isAllowedPinSourceImage } from "@/lib/pin-image";

// Bound the body as well as the HTTP request, including chunked responses.
export async function readImageResponse(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array> {
  if (!response.ok || !response.body)
    throw new Error(`Image HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > maxBytes)
    throw new Error("Image too large");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("Image too large");
      chunks.push(value);
    }
  } catch (e) {
    await reader.cancel();
    throw e;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("Empty image");
  return new Uint8Array(Buffer.concat(chunks));
}
export async function assignedPinResponse(
  pin: PinterestImage,
): Promise<{ bytes: Uint8Array; cloud: boolean }> {
  const base = process.env.NEXT_PUBLIC_IMAGES_CDN?.replace(/\/+$/, "");
  if (pin.asset && base) {
    try {
      const url = `${base}/${pin.asset.key}`;
      if (!isAllowedPinSourceImage(url)) throw new Error("Invalid CDN URL");
      const response = await fetch(url, {
        cache: "no-store",
        redirect: "error",
        signal: AbortSignal.timeout(3000),
      });
      const bytes = await readImageResponse(response, 1024 * 1024);
      await validateJpeg(bytes, pin.asset);
      return { bytes, cloud: true };
    } catch {
      /* The saved composition is the fallback, never a newly chosen template. */
    }
  }
  const images: Partial<Record<Role, Uint8Array>> = {};
  await Promise.all(
    pin.assignment.sources.map(async (source) => {
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
    bytes: new Uint8Array(await renderPin(pin.assignment, images)),
    cloud: false,
  };
}
