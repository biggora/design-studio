import { describe, expect, it } from "vitest";
import { existsSync } from "fs";
import { join } from "path";
import { Design } from "@/types/design";
import {
  FEED_DESCRIPTION_MAX,
  FEED_MAX_ITEMS,
  FEED_TITLE_MAX,
  PIN_HEIGHT,
  PIN_WIDTH,
  assignCollectionSlugs,
  buildCollectionFeedXml,
  buildFeedIndexXml,
  buildFeedItem,
  collectionSlugFor,
  designVersionHash,
  feedDescription,
  feedTitle,
  pinImageUrl,
  pinLandingPath,
  toRfc822,
} from "@/lib/pinterest-feed";

const DOMAIN = "threadquirk.test";

export function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "c4e49734-7bb5-46f4-86c8-7ec6a587c128",
    externalId: 184507566,
    title: "Look Past the Stars Astronaut Design",
    slug: "look-past-the-stars-astronaut-design",
    externalLink: "https://www.redbubble.com/shop/ap/184507566",
    externalImageUrl: "https://ih1.redbubble.com/image.jpg",
    category: "no_category",
    collection: "Space Shirts",
    imageName: "",
    description: "A bold typographic space graphic featuring an explorer with a telescope.",
    keywords: "astronaut,space",
    backgroundColors: "",
    backgroundColor: "#D2E4FF",
    createdAt: "2026-10-07T08:10:00.000Z",
    updatedAt: "2026-10-08T09:00:00.000Z",
    props: {},
    ...overrides,
  };
}

describe("collectionSlugFor", () => {
  it("derives a lowercase ASCII slug from the title", () => {
    expect(collectionSlugFor("Bugs, Tests and Hallucinations", new Set())).toBe(
      "bugs-tests-and-hallucinations",
    );
  });

  it("strips diacritics and symbols", () => {
    expect(collectionSlugFor("Härte & Glanz — Retro", new Set())).toBe("harte-glanz-retro");
  });

  it("falls back to 'collection' when nothing survives slugifying", () => {
    expect(collectionSlugFor("??? 💩", new Set())).toBe("collection");
  });

  it("suffixes collisions deterministically", () => {
    const taken = new Set(["space"]);
    expect(collectionSlugFor("Space", taken)).toBe("space-2");
    expect(collectionSlugFor("Space", new Set(["space", "space-2"]))).toBe("space-3");
  });
});

/** Extracts every URL Pinterest could act on: <link> contents, url="…" and href="…"
 * attributes. The xmlns:media namespace identifier is deliberately not a URL, and
 * relative hrefs (the same-origin stylesheet) cannot leave the domain. */
function feedReferenceUrls(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(/<link>([^<]+)<\/link>|(?:href|url)="([^"]+)"/g)) {
    const value = match[1] || match[2];
    if (value.startsWith("http")) urls.push(value);
  }
  return urls;
}

describe("assignCollectionSlugs", () => {
  it("assigns stable slugs for every collection, title order breaks ties", () => {
    const slugs = assignCollectionSlugs([{ title: "Cats" }, { title: "Bugs, Tests and Hallucinations" }, { title: "Cats!" }]);
    expect(slugs.get("Cats")).toBe("cats");
    expect(slugs.get("Bugs, Tests and Hallucinations")).toBe("bugs-tests-and-hallucinations");
    // The second "Cats"-titled collection gets the suffixed slug, whichever row it is.
    const catsSlugs = [...slugs.values()].filter(slug => slug.startsWith("cats"));
    expect(catsSlugs.sort()).toEqual(["cats", "cats-2"]);
  });
});

describe("designVersionHash", () => {
  it("is a stable 6-hex digest of updatedAt", () => {
    const design = makeDesign();
    expect(designVersionHash(design)).toMatch(/^[0-9a-f]{6}$/);
    expect(designVersionHash(design)).toBe(designVersionHash({ ...design }));
  });

  it("changes when the design changes and falls back through createdAt", () => {
    const design = makeDesign();
    expect(designVersionHash({ ...design, updatedAt: "2026-10-09T00:00:00.000Z" })).not.toBe(
      designVersionHash(design),
    );
    // An empty updatedAt falls through to createdAt.
    expect(designVersionHash({ ...design, updatedAt: "" })).toBe(
      designVersionHash({ ...design, updatedAt: design.createdAt }),
    );
  });
});

describe("pin URLs", () => {
  it("builds the stable landing path and versioned pin URL on the site domain", () => {
    const design = makeDesign();
    expect(pinLandingPath(design)).toBe("/p/look-past-the-stars-astronaut-design");
    const url = new URL(pinImageUrl(DOMAIN, design));
    expect(url.protocol).toBe("https:");
    expect(url.hostname).toBe(DOMAIN);
    expect(url.pathname).toBe("/p/look-past-the-stars-astronaut-design/pin.jpg");
    expect(url.searchParams.get("v")).toBe(designVersionHash(design));
  });

  it("falls back to the uuid when the design has no slug", () => {
    const design = makeDesign({ slug: null });
    expect(pinLandingPath(design)).toBe(`/p/${design.id}`);
  });
});

describe("feed text fields", () => {
  it("keeps the title within 100 characters", () => {
    const long = makeDesign({ title: "A".repeat(250) });
    expect(feedTitle(long).length).toBeLessThanOrEqual(FEED_TITLE_MAX);
    expect(feedTitle(long).endsWith("...")).toBe(true);
    expect(feedTitle(makeDesign())).toBe("Look Past the Stars Astronaut Design");
  });

  it("strips HTML tags and URLs from the description and collapses whitespace", () => {
    const design = makeDesign({
      description: "<b>Space</b> art. Shop https://www.redbubble.com/shop/ap/1 or\n\thttp://evil.example now!",
    });
    const description = feedDescription(design);
    expect(description).not.toMatch(/<[^>]*>/);
    expect(description).not.toMatch(/https?:\/\//);
    expect(description).toContain("Space art.");
    expect(description).toContain("now!");
  });

  it("truncates the description at 500 characters", () => {
    const design = makeDesign({ description: "x".repeat(600) });
    const description = feedDescription(design);
    expect(description.length).toBeLessThanOrEqual(FEED_DESCRIPTION_MAX);
    expect(description.endsWith("...")).toBe(true);
  });
});

describe("toRfc822", () => {
  it("formats RFC 822 dates in GMT", () => {
    expect(toRfc822("2026-10-07T08:10:00.000Z")).toBe("Wed, 07 Oct 2026 08:10:00 GMT");
  });

  it("returns null for missing or invalid dates", () => {
    expect(toRfc822(null)).toBeNull();
    expect(toRfc822("not a date")).toBeNull();
  });
});

describe("buildFeedItem", () => {
  it("renders exactly one media:content, no enclosure, guid equal to link", () => {
    const design = makeDesign();
    const item = buildFeedItem(DOMAIN, { design, listingPublishedAt: "2026-10-06T07:00:00.000Z" });

    expect(item).toContain("<item>");
    expect(item).toContain(`<title>${design.title}</title>`);
    expect((item.match(/<media:content /g) || []).length).toBe(1);
    expect((item.match(/<enclosure/g) || []).length).toBe(0);
    expect(item).toContain(`<guid isPermaLink="true">https://${DOMAIN}/p/${design.slug}</guid>`);
    expect(item).toContain(`<link>https://${DOMAIN}/p/${design.slug}</link>`);
    expect(item).toContain(`<pubDate>Tue, 06 Oct 2026 07:00:00 GMT</pubDate>`);
    expect(item).toContain(
      `medium="image" type="image/jpeg" width="${PIN_WIDTH}" height="${PIN_HEIGHT}"`,
    );
  });

  it("falls back to createdAt for pubDate when no listing date exists", () => {
    const item = buildFeedItem(DOMAIN, { design: makeDesign() });
    expect(item).toContain("<pubDate>Wed, 07 Oct 2026 08:10:00 GMT</pubDate>");
  });

  it("escapes XML-significant characters", () => {
    const item = buildFeedItem(DOMAIN, {
      design: makeDesign({ title: `Cats & Dogs <"best">` }),
    });
    expect(item).toContain("<title>Cats &amp; Dogs &lt;&quot;best&quot;&gt;</title>");
  });
});

describe("buildCollectionFeedXml", () => {
  const collection = { title: "Bugs, Tests & Hallucinations", description: "Tech memes on shirts" };

  it("wraps items in a valid RSS 2.0 channel with the media namespace", () => {
    const designs = [makeDesign(), makeDesign({ id: "00000000-0000-0000-0000-000000000002", slug: "second", title: "Second" })];
    const xml = buildCollectionFeedXml({
      siteName: "ThreadQuirk",
      collection,
      domain: DOMAIN,
      designs,
      earliestListingAt: {},
    });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain(
      `<?xml-stylesheet type="text/xsl" href="/feeds/pinterest.xsl"?>`,
    );
    expect(xml).toContain('<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">');
    expect(xml).toContain("<title>ThreadQuirk – Bugs, Tests &amp; Hallucinations</title>");
    expect(xml).toContain(`<link>https://${DOMAIN}/designs?collection=Bugs%2C%20Tests%20%26%20Hallucinations</link>`);
    expect(xml).toContain("<description>Tech memes on shirts</description>");
    expect(xml).toContain("<language>en</language>");
    expect(xml).toContain("<lastBuildDate>");
    expect((xml.match(/<item>/g) || []).length).toBe(2);
  });

  it("includes at most the 100 most recent designs", () => {
    const designs = Array.from({ length: FEED_MAX_ITEMS + 50 }, (_, i) =>
      makeDesign({ id: `id-${i}`, slug: `design-${i}`, title: `Design ${i}` }),
    );
    const xml = buildCollectionFeedXml({
      siteName: "ThreadQuirk",
      collection,
      domain: DOMAIN,
      designs,
      earliestListingAt: {},
    });
    expect((xml.match(/<item>/g) || []).length).toBe(FEED_MAX_ITEMS);
  });

  it("keeps every URL in the feed on the claimed domain", () => {
    const designs = [
      makeDesign(),
      makeDesign({ id: "00000000-0000-0000-0000-000000000002", slug: "second", title: "Second" }),
    ];
    const xml = buildCollectionFeedXml({
      siteName: "ThreadQuirk",
      collection,
      domain: DOMAIN,
      designs,
      earliestListingAt: { [designs[0].id]: "2026-10-01T00:00:00.000Z" },
    });
    // Every URL Pinterest could act on — link, guid, media:content — must be on
    // the claimed domain.
    const urls = feedReferenceUrls(xml);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).hostname).toBe(DOMAIN);
    }
  });
});

describe("buildFeedIndexXml", () => {
  it("lists every collection feed URL with board name and item count", () => {
    const xml = buildFeedIndexXml({
      siteName: "ThreadQuirk",
      domain: DOMAIN,
      feeds: [
        { title: "Cats", description: "", slug: "cats", itemCount: 42 },
        { title: "Space Shirts", description: "Astronauts", slug: "space-shirts", itemCount: 100 },
      ],
    });
    expect(xml).toContain("<title>ThreadQuirk – Pinterest feed index</title>");
    expect(xml).toContain(
      `<?xml-stylesheet type="text/xsl" href="/feeds/pinterest.xsl"?>`,
    );
    expect(xml).toContain(`<link>https://${DOMAIN}/feeds/pinterest/cats.xml</link>`);
    expect(xml).toContain(`Pinterest board: Cats`);
    expect(xml).toContain(`42 designs`);
    expect(xml).toContain(`100 designs`);
    const urls = feedReferenceUrls(xml);
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) {
      expect(new URL(url).hostname).toBe(DOMAIN);
    }
  });
});

describe("feed stylesheet", () => {
  it("exists in public/ where the xml-stylesheet PI points", () => {
    expect(existsSync(join(process.cwd(), "public", "feeds", "pinterest.xsl"))).toBe(true);
  });
});
