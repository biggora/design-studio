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
  assignDesignsToFeeds,
  buildCollectionFeedXml,
  buildFeedIndexXml,
  buildFeedItem,
  collectionSlugFor,
  designVersionHash,
  feedDescription,
  feedTitle,
  pinImageUrl,
  pinLandingPath,
  pinterestFeedCollection,
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

const FEED_REFS = [
  { title: "Programming", slug: "programming" },
  { title: "Open Source Together", slug: "open-source-together" },
  { title: "Pet Lovers", slug: "pet-lovers" },
];

function permutations<T>(items: readonly T[]): T[][] {
  if (items.length <= 1) return [[...items]];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map(rest => [item, ...rest]),
  );
}

describe("pinterestFeedCollection", () => {
  it("picks the primary collection when it is one of the design's feed collections", () => {
    expect(pinterestFeedCollection({ collection: "Pet Lovers" }, FEED_REFS)).toBe("Pet Lovers");
    expect(pinterestFeedCollection({ collection: "Programming" }, FEED_REFS)).toBe("Programming");
  });

  it("falls back to the first slug alphabetically when the primary label is empty", () => {
    expect(pinterestFeedCollection({ collection: "" }, FEED_REFS)).toBe("Open Source Together");
  });

  it("falls back to the first slug alphabetically when the primary is not a membership", () => {
    expect(pinterestFeedCollection({ collection: "Retro" }, FEED_REFS)).toBe("Open Source Together");
  });

  it("returns undefined when the design has no feed collections", () => {
    expect(pinterestFeedCollection({ collection: "Pet Lovers" }, [])).toBeUndefined();
    expect(pinterestFeedCollection({ collection: "" }, [])).toBeUndefined();
  });

  it("returns the only collection when there is just one", () => {
    expect(pinterestFeedCollection({ collection: "" }, [{ title: "Solo", slug: "solo" }])).toBe("Solo");
  });

  it("gives the same answer for every ordering of the input collections", () => {
    for (const order of permutations(FEED_REFS)) {
      expect(pinterestFeedCollection({ collection: "" }, order)).toBe("Open Source Together");
      expect(pinterestFeedCollection({ collection: "Programming" }, order)).toBe("Programming");
    }
  });

  it("orders by slug, not by title", () => {
    const refs = [
      { title: "Alpha", slug: "z-alpha" },
      { title: "Zulu", slug: "a-zulu" },
    ];
    expect(pinterestFeedCollection({ collection: "" }, refs)).toBe("Zulu");
    expect(pinterestFeedCollection({ collection: "" }, [...refs].reverse())).toBe("Zulu");
  });

  it("compares slugs by plain code unit, not by locale or numeric order", () => {
    // "feed-10" < "feed-9" by code unit (numeric collation would say otherwise).
    expect(
      pinterestFeedCollection({ collection: "" }, [
        { title: "Nine", slug: "feed-9" },
        { title: "Ten", slug: "feed-10" },
      ]),
    ).toBe("Ten");
    // Uppercase sorts before lowercase by code unit (localeCompare would put "a" first).
    expect(
      pinterestFeedCollection({ collection: "" }, [
        { title: "Lower", slug: "a-feed" },
        { title: "Upper", slug: "B-feed" },
      ]),
    ).toBe("Upper");
    // A prefix sorts before its extension.
    expect(
      pinterestFeedCollection({ collection: "" }, [
        { title: "Cats 2", slug: "cats-2" },
        { title: "Cats", slug: "cats" },
      ]),
    ).toBe("Cats");
  });

  it("prefers the smallest collection over the primary one", () => {
    const refs = [
      { title: "AI Hype", slug: "ai-hype", size: 28 },
      { title: "Trust Boundaries", slug: "trust-boundaries", size: 7 },
      { title: "Programming", slug: "programming", size: 109 },
    ];
    for (const order of permutations(refs)) {
      expect(pinterestFeedCollection({ collection: "AI Hype" }, order)).toBe("Trust Boundaries");
    }
  });

  it("breaks an equal-size tie by primary collection, then by slug", () => {
    const refs = [
      { title: "Zeta", slug: "zeta", size: 5 },
      { title: "Alpha", slug: "alpha", size: 5 },
    ];
    expect(pinterestFeedCollection({ collection: "Zeta" }, refs)).toBe("Zeta");
    expect(pinterestFeedCollection({ collection: "" }, refs)).toBe("Alpha");
  });

  it("ranks collections without a known size after sized ones", () => {
    const refs = [
      { title: "Primary", slug: "primary" },
      { title: "Niche", slug: "niche", size: 3 },
    ];
    expect(pinterestFeedCollection({ collection: "Primary" }, refs)).toBe("Niche");
  });

  it("breaks an identical-slug tie by title and stays order independent", () => {
    const refs = [
      { title: "b-title", slug: "same" },
      { title: "B-title", slug: "same" },
      { title: "a-title", slug: "same" },
    ];
    for (const order of permutations(refs)) {
      // Code-unit order: "B-title" < "a-title" < "b-title".
      expect(pinterestFeedCollection({ collection: "" }, order)).toBe("B-title");
    }
  });
});

// Overlapping fixture: designs in 2-3 collections, some with none, some whose
// primary label is not among their memberships.
const FIXTURE_FEED_TITLES = ["Cats", "Space", "Dogs", "Tech Memes", "Retro"];

function fixtureDesigns(): Design[] {
  const base = (id: string, collection: string) =>
    makeDesign({ id, slug: `slug-${id}`, title: `Design ${id}`, collection });
  return [
    base("d1", "Cats"),
    base("d2", "Space"),
    base("d3", "Dogs"),
    base("d4", ""),
    base("d5", "Retro"),
    base("d6", "Tech Memes"),
    base("d7", ""),
    base("d8", "Orphan"),
    base("d9", "Dogs"),
    base("d10", "Cats"),
  ];
}

function fixtureMemberships(): Map<string, string[]> {
  return new Map([
    ["d1", ["Cats", "Space"]],
    ["d2", ["Cats", "Space"]],
    ["d3", ["Cats", "Dogs", "Retro"]],
    ["d4", ["Space", "Retro", "Tech Memes"]],
    ["d5", ["Space", "Tech Memes"]], // primary "Retro" is not a membership
    ["d6", ["Tech Memes"]],
    // d7: no memberships at all
    ["d8", ["Orphan"]], // a collection without a feed
    ["d9", ["Dogs", "Cats", "Space"]],
    ["d10", ["Retro", "Cats"]],
  ]);
}

function fixtureFeedSlugs(): Map<string, string> {
  return assignCollectionSlugs(FIXTURE_FEED_TITLES.map(title => ({ title })));
}

function idsByFeed(feeds: Map<string, Design[]>): Record<string, string[]> {
  return Object.fromEntries([...feeds].map(([title, designs]) => [title, designs.map(design => design.id)]));
}

describe("assignDesignsToFeeds", () => {
  it("places each design in exactly one feed, by primary else first slug", () => {
    const feeds = assignDesignsToFeeds(fixtureDesigns(), fixtureMemberships(), fixtureFeedSlugs());
    expect(idsByFeed(feeds)).toEqual({
      Cats: ["d1", "d10"],
      Space: ["d2", "d5"],
      Dogs: ["d3", "d9"],
      Retro: ["d4"],
      "Tech Memes": ["d6"],
    });
  });

  it("never lists a design in more than one feed", () => {
    const feeds = assignDesignsToFeeds(fixtureDesigns(), fixtureMemberships(), fixtureFeedSlugs());
    const placed = [...feeds.values()].flat().map(design => design.id);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("covers every design with at least one feed collection, and only those", () => {
    const designs = fixtureDesigns();
    const memberships = fixtureMemberships();
    const slugs = fixtureFeedSlugs();
    const feeds = assignDesignsToFeeds(designs, memberships, slugs);
    const placed = new Set([...feeds.values()].flat().map(design => design.id));
    const expected = new Set(
      designs
        .filter(design => (memberships.get(design.id) ?? []).some(title => slugs.has(title)))
        .map(design => design.id),
    );
    expect(expected.size).toBeGreaterThanOrEqual(5);
    expect(placed).toEqual(expected);
  });

  it("keeps designs without any (feed) collection out of every feed", () => {
    const feeds = assignDesignsToFeeds(fixtureDesigns(), fixtureMemberships(), fixtureFeedSlugs());
    const placed = [...feeds.values()].flat().map(design => design.id);
    expect(placed).not.toContain("d7"); // no memberships
    expect(placed).not.toContain("d8"); // only a collection without a feed
  });

  it("preserves input order within each feed", () => {
    const reversed = [...fixtureDesigns()].reverse();
    const feeds = assignDesignsToFeeds(reversed, fixtureMemberships(), fixtureFeedSlugs());
    expect(idsByFeed(feeds)).toEqual({
      Cats: ["d10", "d1"],
      Space: ["d5", "d2"],
      Dogs: ["d9", "d3"],
      Retro: ["d4"],
      "Tech Memes": ["d6"],
    });
  });

  it("does not depend on the order of a design's memberships", () => {
    const reversedMemberships = new Map(
      [...fixtureMemberships()].map(([id, titles]) => [id, [...titles].reverse()]),
    );
    const feeds = assignDesignsToFeeds(fixtureDesigns(), reversedMemberships, fixtureFeedSlugs());
    expect(idsByFeed(feeds)).toEqual(
      idsByFeed(assignDesignsToFeeds(fixtureDesigns(), fixtureMemberships(), fixtureFeedSlugs())),
    );
  });

  it("moves multi-collection designs to their smallest feed when sizes are known", () => {
    const sizes = new Map([["Cats", 4], ["Space", 5], ["Dogs", 2], ["Tech Memes", 3], ["Retro", 3]]);
    const feeds = assignDesignsToFeeds(fixtureDesigns(), fixtureMemberships(), fixtureFeedSlugs(), sizes);
    expect(idsByFeed(feeds)).toEqual({
      Cats: ["d1", "d2"],
      Dogs: ["d3", "d9"],
      Retro: ["d4", "d10"],
      "Tech Memes": ["d5", "d6"],
    });
    const placed = [...feeds.values()].flat().map(design => design.id);
    expect(new Set(placed).size).toBe(placed.length);
  });

  it("returns an empty map when nothing has a feed", () => {
    expect(assignDesignsToFeeds(fixtureDesigns(), new Map(), fixtureFeedSlugs()).size).toBe(0);
    expect(assignDesignsToFeeds([], fixtureMemberships(), fixtureFeedSlugs()).size).toBe(0);
  });
});

// Golden output captured from the (untouched) item builder: the one-feed rule
// must change which feed carries a design, never how an item is rendered.
describe("feed items are unchanged by the one-feed rule", () => {
  const keptDesign = makeDesign({
    id: "d1",
    slug: "retro-cat-moon-tee",
    title: "Retro Cat & Moon <Tee>",
    collection: "Cats",
    description: "A <b>retro</b> cat on the moon. Shop https://x.example now",
    externalId: 1,
    externalLink: "https://www.redbubble.com/shop/ap/1",
    keywords: "cat,moon",
  });
  const LISTING = "2026-10-06T07:00:00.000Z";
  const EXPECTED_ITEM = [
    "    <item>",
    "      <title>Retro Cat &amp; Moon &lt;Tee&gt;</title>",
    "      <link>https://threadquirk.test/p/retro-cat-moon-tee</link>",
    '      <guid isPermaLink="true">https://threadquirk.test/p/retro-cat-moon-tee</guid>',
    "      <description>A retro cat on the moon. Shop now</description>",
    "      <pubDate>Tue, 06 Oct 2026 07:00:00 GMT</pubDate>",
    '      <media:content url="https://threadquirk.test/p/retro-cat-moon-tee/pin.jpg?v=17bbe9" medium="image" type="image/jpeg" width="1000" height="1500"/>',
    "    </item>",
  ].join("\n");

  function catsFeed(): Design[] {
    const designs = [keptDesign, ...fixtureDesigns().filter(design => design.id !== "d1")];
    return assignDesignsToFeeds(designs, fixtureMemberships(), fixtureFeedSlugs()).get("Cats") ?? [];
  }

  it("renders a kept design byte-for-byte as before", () => {
    const kept = catsFeed().find(design => design.id === "d1");
    expect(kept).toBeDefined();
    expect(buildFeedItem("threadquirk.test", { design: kept as Design, listingPublishedAt: LISTING })).toBe(
      EXPECTED_ITEM,
    );
  });

  it("embeds that exact item in the collection feed that carries the design", () => {
    const designs = catsFeed();
    const xml = buildCollectionFeedXml({
      siteName: "ThreadQuirk",
      collection: { title: "Cats", description: "Feline friends" },
      domain: "threadquirk.test",
      designs,
      earliestListingAt: { d1: LISTING },
      now: new Date("2026-10-10T00:00:00.000Z"),
    });
    expect(xml).toContain(`\n${EXPECTED_ITEM}\n`);
    expect((xml.match(/<item>/g) || []).length).toBe(designs.length);
    expect(xml).toContain("<lastBuildDate>Sat, 10 Oct 2026 00:00:00 GMT</lastBuildDate>");
  });
});
