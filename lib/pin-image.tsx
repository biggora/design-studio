import { ImageResponse } from "next/og";
import sharp from "sharp";
import { PIN_HEIGHT, PIN_WIDTH } from "@/lib/pinterest-feed";

/**
 * Renders the 1000×1500 (2:3) Pinterest pin for a design: the design's mockup
 * on its own background colour, scaled to fit ~1000×1000 in the upper part,
 * with the design title in the lower band.
 *
 * Layout/text goes through `next/og`'s ImageResponse (satori, bundled Noto Sans
 * — no dependency on system fonts), and the result is encoded as JPEG with
 * `sharp`, which next itself already installs for image optimisation. No
 * additional dependency for either.
 */

const MAX_PIN_BYTES = 1024 * 1024;

// Mirrors the remotePatterns allowlist in next.config.mjs — pins are only ever
// composed from the same hosts the storefront may hotlink.
const ALLOWED_IMAGE_HOST_SUFFIXES = [".redbubble.com", ".redbubble.net", ".placeholder.com"];

export function isAllowedPinSourceImage(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") return false;
    return ALLOWED_IMAGE_HOST_SUFFIXES.some(
      suffix => parsed.hostname === suffix.slice(1) || parsed.hostname.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

const FALLING_BACKGROUND = "#FFFFFF";
const LIGHT_TEXT = "#212A31"; // Loom Ink
const DARK_TEXT = "#FFFFFF";

/** Dark text on light backgrounds and vice versa, so the title is legible over any design colour. */
export function pinTextColor(backgroundColor: string | null | undefined): string {
  const hex = /^#([0-9a-f]{6})$/i.exec(backgroundColor?.trim() || "")?.[1];
  if (!hex) return LIGHT_TEXT;
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 140 ? LIGHT_TEXT : DARK_TEXT;
}

export type PinImageInput = {
  /** Raw bytes of the design's display image, fetched server-side from the allow-listed host. */
  image: Uint8Array;
  title: string;
  backgroundColor?: string | null;
};

export async function renderPinImage({ image, title, backgroundColor }: PinImageInput): Promise<Buffer> {
  // Normalize whatever the marketplace CDN sent (jpeg/png/webp) into a PNG data
  // URL satori can always decode, so a changed upstream format can't break pins.
  const source = await sharp(Buffer.from(image)).rotate().png().toBuffer();
  const background = /^#[0-9a-f]{6}$/i.test(backgroundColor?.trim() || "")
    ? (backgroundColor as string).trim()
    : FALLING_BACKGROUND;

  const card = new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          backgroundColor: background,
        }}
      >
        <div
          style={{
            display: "flex",
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            padding: "36px",
          }}
        >
          {/* Satori renders this element itself — next/image does not apply inside ImageResponse. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt=""
            src={`data:image/png;base64,${source.toString("base64")}`}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        </div>
        <div
          style={{
            display: "flex",
            height: 300,
            alignItems: "center",
            justifyContent: "center",
            padding: "0 72px",
            color: pinTextColor(background),
          }}
        >
          <p
            style={{
              fontSize: 64,
              lineHeight: 1.25,
              textAlign: "center",
              lineClamp: 3,
              overflow: "hidden",
            }}
          >
            {title}
          </p>
        </div>
      </div>
    ),
    { width: PIN_WIDTH, height: PIN_HEIGHT },
  );
  const cardPng = Buffer.from(await card.arrayBuffer());

  for (const quality of [82, 70, 58, 46]) {
    const jpeg = await sharp(cardPng).jpeg({ quality, mozjpeg: true }).toBuffer();
    if (jpeg.length <= MAX_PIN_BYTES || quality === 46) return jpeg;
  }
  throw new Error("Pin image encoding failed");
}
