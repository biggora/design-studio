import Image from "next/image";
import { Design } from "@/types/design";
import {
  designCardHeight,
  designCardWidth,
  getDesignImage,
  imageBlurPlaceholder,
  NO_IMAGE_PLACEHOLDER,
  watermarkText,
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
};

/**
 * The one artwork element for design images. Designs published to the
 * pod-uploader CDN render a plain <img> with a srcSet over the immutable
 * thumb/card/main WebP variants — they must bypass /_next/image because
 * Vercel holds no CDN credentials and must not fetch-and-reproxy those
 * files; the browser picks the variant by rendered width. Every other
 * design keeps next/image (Redbubble hosts, blur placeholder, optimizer).
 * When NEXT_PUBLIC_WATERMARK is set, a small DOM-only caption is stamped
 * over the artwork (absent from OG/Pinterest/API image URLs by design).
 */
export function DesignImage({ design, alt, className, sizes, priority, fill = false, width, height }: DesignImageProps) {
  const source = getDesignImage(design);
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
          decoding="async"
          className={cn(fill && "absolute inset-0 h-full w-full", className)}
        />
        {watermark && <WatermarkMark text={watermark} />}
      </>
    );
  }
  return (
    <>
      <Image
        src={source.src}
        alt={alt}
        fill={fill}
        sizes={sizes}
        width={fill ? undefined : width ?? designCardWidth}
        height={fill ? undefined : height ?? designCardHeight}
        priority={priority}
        placeholder="blur"
        blurDataURL={imageBlurPlaceholder}
        className={className}
      />
      {watermark && <WatermarkMark text={watermark} />}
    </>
  );
}

function WatermarkMark({ text }: { text: string }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-2 right-2 z-10 select-none rounded bg-background/60 px-1.5 py-0.5 text-[10px] font-medium leading-none text-foreground/70 backdrop-blur-[2px]"
    >
      {text}
    </span>
  );
}
