import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";
import {load} from "cheerio";
import {Design} from "@/types/design";
import {DesignThumbs} from "@/app/components/DesignThumbs";

vi.mock("next/image", () => ({
  default: ({src, alt, className}: {src: string; alt: string; className?: string}) =>
    React.createElement("img", {src, alt, className}),
}));

const cdnDesign = (id: string, width: number, height: number) => ({
  id, slug: id, title: id, description: "d", collection: "", externalImageUrl: "", backgroundColor: "#ffffff",
  cdnImage: {key: `designs/${id}`, version: 1, width, height},
}) as Design;
const remoteDesign = (id: string) => ({
  id, slug: id, title: id, description: "d", collection: "",
  externalImageUrl: `https://ih1.redbubble.net/${id}.jpg`, backgroundColor: "",
}) as Design;

describe("DesignThumbs", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("renders nothing without designs", () => {
    expect(renderToStaticMarkup(<DesignThumbs />)).toBe("");
    expect(renderToStaticMarkup(<DesignThumbs designs={[]} />)).toBe("");
  });

  it("fills each 3:4 tile with 2:3, 4:5 and 3:4 images (cover, no bars), clipped and rounded", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.example.test");
    const $ = load(renderToStaticMarkup(
      <DesignThumbs designs={[cdnDesign("a", 1024, 1536), cdnDesign("b", 1122, 1402), remoteDesign("c")]} />,
    ));
    const tiles = $("[aria-hidden='true'] > div");
    expect(tiles).toHaveLength(3);
    tiles.each((_, tile) => {
      const tileClasses = ($(tile).attr("class") ?? "").split(/\s+/);
      expect(tileClasses).toEqual(expect.arrayContaining(["relative", "aspect-[3/4]", "overflow-hidden", "rounded-md"]));
      const imgClasses = ($(tile).find("img").attr("class") ?? "").split(/\s+/);
      expect(imgClasses).toEqual(expect.arrayContaining(["object-cover", "object-center"]));
      expect(imgClasses).not.toContain("object-contain");
    });
    // CDN images are absolutely positioned over the whole tile.
    expect(($(tiles[0]).find("img").attr("class") ?? "").split(/\s+/))
      .toEqual(expect.arrayContaining(["absolute", "inset-0", "h-full", "w-full"]));
  });

  it("shows at most three thumbs", () => {
    const $ = load(renderToStaticMarkup(
      <DesignThumbs designs={[remoteDesign("a"), remoteDesign("b"), remoteDesign("c"), remoteDesign("d")]} />,
    ));
    expect($("img")).toHaveLength(3);
  });
});
