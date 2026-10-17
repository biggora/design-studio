import React from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {Design} from "@/types/design";
import {DesignCard} from "@/app/components/DesignCard";

vi.mock("next/image", () => ({default: ({src, alt}: {src: string; alt: string}) => React.createElement("img", {src, alt})}));
vi.mock("next/link", () => ({default: ({children, ...props}: React.ComponentProps<"a">) => <a {...props}>{children}</a>}));

describe("DesignCard", () => {
  it("links the collection with the single '+' URL form", () => {
    const design = {id: "1", slug: "cat", title: "Cat", description: "d", collection: "Pet lovers & friends",
      externalImageUrl: "https://ih1.redbubble.net/a.jpg", backgroundColor: ""} as Design;
    const html = renderToStaticMarkup(<DesignCard design={design}/>);
    expect(html).toContain('href="/designs?collection=Pet+lovers+%26+friends"');
    expect(html).not.toContain("%20");
  });
});
