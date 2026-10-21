import Image from "next/image";
import { Design } from "@/types/design";
import {
  designCardHeight,
  designCardWidth,
  getDesignImage,
  imageBlurPlaceholder,
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
 */
export function DesignImage({ design, alt, className, sizes, priority, fill = false, width, height }: DesignImageProps) {
  const source = getDesignImage(design);
  if (source.kind === "cdn") {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- immutable pre-sized CDN variants must not go through the image optimizer
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
    );
  }
  return (
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
  );
}
