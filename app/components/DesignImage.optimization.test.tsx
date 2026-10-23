import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesignImage } from "./DesignImage";
import type { Design } from "@/types/design";

const design = {
  id: "test",
  externalImageUrl: "https://ih1.redbubble.net/artwork.jpg",
  props: {},
} as Design;

afterEach(() => vi.unstubAllEnvs());

describe("product mockups with the real Next.js Image component", () => {
  it.each(["hat", "mug", "mousepad"])(
    "loads %s directly without optimizer URLs",
    (product) => {
      const src = `https://ih1.redbubble.net/${product}.webp`;
      const html = renderToStaticMarkup(
        <DesignImage
          design={design}
          src={src}
          alt={product}
          fill
          sizes="200px"
        />,
      );
      expect(html).toContain(`src="${src}"`);
      expect(html).not.toContain("/_next/image");
      expect(html).toContain('loading="lazy"');
      expect(html).toContain("position:absolute");
    },
  );

  it("preserves optimization for the primary remote artwork fallback", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const html = renderToStaticMarkup(
      <DesignImage design={design} alt="Artwork" />,
    );
    expect(html).toContain("/_next/image?");
  });
});
