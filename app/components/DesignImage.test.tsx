import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Design } from "@/types/design";
import { DesignImage } from "@/app/components/DesignImage";

// Marker mock: a remote design must go through next/image (the /_next/image
// optimizer in production), a CDN design must not touch it at all.
vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string | { src: string }; alt: string }) =>
    React.createElement("img", { "data-next-image": "true", src: typeof src === "string" ? src : src.src, alt }),
}));

const cdnBase = "https://images.threadquirk.lv";
const key = "designs/f45e5bc7a5342c2c";

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "d1",
    externalId: null,
    title: "Space cat",
    slug: "space-cat",
    externalLink: "",
    externalImageUrl: "https://ih1.redbubble.net/images/flat.png",
    category: "",
    collection: "",
    imageName: "",
    description: "",
    keywords: "",
    backgroundColors: "",
    backgroundColor: "#ffffff",
    createdAt: "",
    updatedAt: "",
    props: {},
    ...overrides,
  };
}

describe("DesignImage", () => {
  it("renders the CDN srcSet without /_next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", cdnBase);
    const html = renderToStaticMarkup(
      <DesignImage design={makeDesign({ cdnImage: { key, version: 2, width: 1600, height: 1920 } })} alt="Space cat" sizes="30vw" />,
    );
    expect(html).toContain(`src="${cdnBase}/${key}/card-v2.webp"`);
    // React 19 keeps the camelCase prop name in SSR output; HTML attribute
    // names are case-insensitive, so the browser reads it as srcset.
    expect(html).toContain(`srcSet="${cdnBase}/${key}/thumb-v2.webp 400w, ${cdnBase}/${key}/card-v2.webp 800w, ${cdnBase}/${key}/main-v2.webp 1600w"`);
    expect(html).toContain('sizes="30vw"');
    expect(html).toContain('width="1600"');
    expect(html).toContain('height="1920"');
    expect(html).toContain('alt="Space cat"');
    expect(html).not.toContain("_next/image");
    expect(html).not.toContain("data-next-image");
    vi.unstubAllEnvs();
  });

  it("keeps remote designs on next/image", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const html = renderToStaticMarkup(<DesignImage design={makeDesign()} alt="Space cat" />);
    expect(html).toContain("data-next-image");
    expect(html).toContain("https://ih1.redbubble.net/images/flat.png");
    vi.unstubAllEnvs();
  });

  it("stamps the watermark caption over both branches when NEXT_PUBLIC_WATERMARK is set", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", cdnBase);
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "threadquirk.lv");
    const cdnHtml = renderToStaticMarkup(
      <DesignImage design={makeDesign({ cdnImage: { key, version: 2, width: 1600, height: 1920 } })} alt="Space cat" sizes="30vw" />,
    );
    expect(cdnHtml).toContain(">threadquirk.lv</span>");
    expect(cdnHtml).toContain('aria-hidden="true"');
    expect(cdnHtml).toContain("pointer-events-none");

    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const remoteHtml = renderToStaticMarkup(<DesignImage design={makeDesign()} alt="Space cat" />);
    expect(remoteHtml).toContain(">threadquirk.lv</span>");
    vi.unstubAllEnvs();
  });

  it("omits the watermark when the env is empty", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "   ");
    const html = renderToStaticMarkup(<DesignImage design={makeDesign()} alt="Space cat" />);
    expect(html).not.toContain("pointer-events-none");
    vi.unstubAllEnvs();
  });

  it("skips the watermark on the no-image placeholder", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    vi.stubEnv("NEXT_PUBLIC_WATERMARK", "threadquirk.lv");
    const html = renderToStaticMarkup(
      <DesignImage design={makeDesign({ externalImageUrl: "  " })} alt="Space cat" />,
    );
    expect(html).not.toContain("threadquirk.lv");
    vi.unstubAllEnvs();
  });
});
