import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {afterEach, describe, expect, it, vi} from "vitest";
import {Design} from "@/types/design";
import {DesignCard} from "@/app/components/DesignCard";

vi.mock("next/image", () => ({
  default: ({src, alt, className}: {src: string; alt: string; className?: string}) =>
    React.createElement("img", {src, alt, className}),
}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));

const imgClass = (html: string) => /<img[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";

describe("DesignCard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("links the collection with the single '+' URL form", () => {
    const design = {id: "1", slug: "cat", title: "Cat", description: "d", collection: "Pet lovers & friends",
      externalImageUrl: "https://ih1.redbubble.net/a.jpg", backgroundColor: ""} as Design;
    const html = renderToStaticMarkup(<DesignCard design={design}/>);
    expect(html).toContain('href="/designs?collection=Pet+lovers+%26+friends"');
    expect(html).not.toContain("%20");
  });

  it.each([
    ["2:3", 1024, 1536],
    ["4:5", 1122, 1402],
  ])("fills the 3:4 box with a %s CDN mockup (cover, no bars) and keeps the hover zoom", (_ratio, width, height) => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "https://images.example.test");
    const design = {id: "1", slug: "cat", title: "Cat", description: "d", collection: "", externalImageUrl: "",
      backgroundColor: "#ffffff", cdnImage: [{key: "designs/x", kind: "flat-full" as const, version: 1, width, height}]} as Design;
    const html = renderToStaticMarkup(<DesignCard design={design}/>);
    const classes = imgClass(html).split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining([
      "absolute", "inset-0", "h-full", "w-full", "object-cover", "object-center",
      "transition-transform", "group-hover:scale-[1.4]",
    ]));
    expect(classes).not.toContain("object-contain");
    // The zoom is clipped by the rounded, overflow-hidden link around the aspect box.
    expect(html).toMatch(/<a [^>]*class="[^"]*block[^"]*overflow-hidden[^"]*rounded-md/);
    expect(html).toContain("aspect-[3/4]");
  });

  it("uses the same cover rule for next/image (Redbubble) cards", () => {
    vi.stubEnv("NEXT_PUBLIC_IMAGES_CDN", "");
    const design = {id: "1", slug: "cat", title: "Cat", description: "d", collection: "",
      externalImageUrl: "https://ih1.redbubble.net/a.jpg", backgroundColor: ""} as Design;
    const classes = imgClass(renderToStaticMarkup(<DesignCard design={design}/>)).split(/\s+/);
    expect(classes).toEqual(expect.arrayContaining(["object-cover", "object-center", "group-hover:scale-[1.4]"]));
    expect(classes).not.toContain("object-contain");
  });
});
