import Image from "next/image";
import type { CSSProperties } from "react";
import { Design } from "@/types/design";
import {
  designCardHeight,
  designCardWidth,
  getDesignImage,
  imageBlurPlaceholder,
  NO_IMAGE_PLACEHOLDER,
  watermarkText,
  type DesignImageOrientation,
  type DesignImageSource,
} from "@/lib/image";
import { cn } from "@/lib/utils";

type DesignImageProps = {
  design: Design;
  alt: string;
  className?: string;
  /** Responsive hint the browser uses to pick a CDN variant; passed to next/image unchanged. */
  sizes?: string;
  priority?: boolean;
  /** Stretch over the nearest positioned ancestor (next/image `fill` semantics). */
  fill?: boolean;
  /** Intrinsic size for the next/image fallback (defaults to the card ladder). */
  width?: number;
  height?: number;
  /**
   * Render this URL instead of the design's primary image — for the product
   * mockups (`props.mockup_hat` / `mockup_mug` / `mockup_mousepad`) the detail
   * page shows beside the artwork. These ready-made product previews load
   * directly, without Vercel Image Optimization transformations.
   */
  src?: string;
  /**
   * Which stored CDN mockup fits the surface: portrait (default — the catalog
   * card pick) or landscape (the home hero and about-teaser tiles).
   */
  orientation?: DesignImageOrientation;
};

/**
 * The one artwork element for design images. Designs published to the
 * pod-uploader CDN render a plain <img> with a srcSet over the immutable
 * thumb/card/main WebP variants — they must bypass /_next/image because
 * Vercel holds no CDN credentials and must not fetch-and-reproxy those
 * files; the browser picks the variant by rendered width. Every other
 * design keeps next/image (Redbubble hosts, blur placeholder, optimizer).
 * Explicit product mockups bypass optimization as well.
 * When NEXT_PUBLIC_WATERMARK is set, a DOM-only checkerboard watermark is
 * tiled over the artwork (absent from OG/Pinterest/API image URLs by design).
 */
export function DesignImage({ design, alt, className, sizes, priority, fill = false, width, height, src, orientation }: DesignImageProps) {
  const source: DesignImageSource = src ? { kind: "remote", src } : getDesignImage(design, orientation);
  // Anchors to the nearest positioned ancestor — the aspect box on cards, the
  // relative parent on the detail page. The placeholder is not artwork; no mark.
  const watermark =
    source.kind === "remote" && source.src === NO_IMAGE_PLACEHOLDER ? null : watermarkText();

  if (source.kind === "cdn") {
    return (
      <>
        {/* eslint-disable-next-line @next/next/no-img-element -- immutable pre-sized CDN variants must not go through the image optimizer */}
        <img
          src={source.src}
          srcSet={source.srcSet}
          sizes={sizes}
          width={source.width}
          height={source.height}
          alt={alt}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
          className={cn(fill && "absolute inset-0 h-full w-full", className)}
        />
        {watermark && <WatermarkOverlay text={watermark} />}
      </>
    );
  }
  return (
    <>
      <Image
        src={source.src}
        unoptimized={!!src}
        alt={alt}
        fill={fill}
        sizes={sizes}
        width={fill ? undefined : width ?? designCardWidth}
        height={fill ? undefined : height ?? designCardHeight}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : undefined}
        placeholder="blur"
        blurDataURL={imageBlurPlaceholder}
        className={className}
      />
      {watermark && <WatermarkOverlay text={watermark} />}
    </>
  );
}

// Staggered-checkerboard tile: one text row per `height` band, every second
// mark offset by half a tile (marks at (x, y) and (x + width/2, y + height/2)),
// so the grid repeats seamlessly. Encoded as a data-URI SVG mask; the ink
// color stays in .watermark-tile (token-sourced). Tile width is derived from
// the text so a long domain never collides with its staggered neighbor.
function watermarkMask(text: string): string {
  const textWidth = text.length * 10;
  const width = Math.max(240, textWidth * 2 + 96);
  const height = 150;
  const glyph = `font-family='system-ui, sans-serif' font-size='15' font-weight='500'`;
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' width='${width}' height='${height}'>` +
    `<text x='10' y='22' ${glyph}>${text}</text>` +
    `<text x='${width / 2 + 10}' y='${height / 2 + 22}' ${glyph}>${text}</text>` +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function WatermarkOverlay({ text }: { text: string }) {
  return (
    <span
      aria-hidden="true"
      className="watermark-tile pointer-events-none absolute inset-0 z-10"
      style={{ "--watermark-mask": watermarkMask(text) } as CSSProperties}
    />
  );
}
