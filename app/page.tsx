import { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
import { getSiteConfig, fetchDesigns, fetchFeaturedCollections, fetchLiveGiftPages } from "@/utils/database";
import { Design } from "@/types/design";
import { HomeConfig, HomeValue, SiteConfig } from "@/lib/store";
import {
  getDesignDisplayImage,
  designCardHeight,
  designCardWidth,
  imageBlurPlaceholder,
} from "@/lib/image";
import { DesignCard } from "@/app/components/DesignCard";
import { Input } from "@/components/ui/input";
import { Button, buttonVariants } from "@/components/ui/button";
import { AccentLink } from "@/app/components/AccentLink";
import { LinkChip } from "@/app/components/LinkChip";
import { Eyebrow } from "@/app/components/Eyebrow";
import { collectionPath } from "@/lib/collections";
import { giftPath, orderGiftPages } from "@/lib/gifts";
import { designPath } from "@/lib/slug";
import { safeHexColor } from "@/lib/utils";
import defaultConfig from "@/config/config.json";

// The interest navs are a teaser, not a directory: the operator's config order
// is the curation, and everything past the first few chips lives behind the
// "See all" links — the full walls (26 collections + 15 gift pages here) push
// the first print several screens down, worst on mobile.
const HOME_CHIP_LIMIT = 6;
const FEATURED_LIMIT = 5;

function parseHomeValues(value: HomeConfig["values"]): HomeValue[] {
  let raw: unknown = value;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  return Array.isArray(raw)
    ? raw.filter(
        (item): item is HomeValue =>
          !!item &&
          typeof item.title === "string" &&
          typeof item.description === "string",
      )
    : [];
}

export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const home = {...defaultConfig.home, ...config.home};
  const title = `${home.title} - ${config.name}`;

  return {
    title,
    description: home.description,
    alternates: { canonical: "/" },
    openGraph: {
      url: `https://${config.domain}`,
      type: "website",
      title,
      description: home.description,
    },
    twitter: {
      title,
      description: home.description,
    },
  };
}

/** Framed artwork card shared by the hero and the about teaser. */
function ArtCard({ design, caption, priority }: { design: Design; caption?: string; priority?: boolean }) {
  const displayImage =
    getDesignDisplayImage(design).trim() || "/images/no_image_available.svg";
  // Designs without a baked background fall back to the muted surface instead
  // of letting the frame show through as dark letterbox bands.
  const bakedBackground = safeHexColor(design.backgroundColor);

  return (
    <div className="mx-auto w-full max-w-md rounded-xl border border-border bg-card p-3 shadow-xl">
      <AccentLink
        href={designPath(design)}
        className="block overflow-hidden rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        tabIndex={-1}
        aria-hidden="true"
      >
        <div
          className="relative aspect-[4/3] w-full bg-muted"
          style={bakedBackground ? { backgroundColor: bakedBackground } : undefined}
        >
          <Image
            src={displayImage}
            alt=""
            width={designCardWidth}
            height={designCardHeight}
            priority={priority}
            placeholder="blur"
            blurDataURL={imageBlurPlaceholder}
            className="object-contain w-full h-full"
            sizes="(max-width: 1024px) 100vw, 40vw"
          />
        </div>
      </AccentLink>
      {caption ? (
        <p className="mt-3 border-t border-border pt-3 text-center text-sm text-muted-foreground">
          {caption}
        </p>
      ) : null}
    </div>
  );
}

export default async function Home() {
  const { designs } = await fetchDesigns(1, "", "", FEATURED_LIMIT);
  const featuredDesigns: Design[] = designs || [];
  const config: SiteConfig = await getSiteConfig();
  const home: HomeConfig = {...defaultConfig.home, ...config.home};
  const collections = await fetchFeaturedCollections(config.collectionPages);
  const giftPages = orderGiftPages(await fetchLiveGiftPages(config.giftPages));

  const values = parseHomeValues(home.values);
  const aboutPoints = parseHomeValues(home.aboutPoints);
  const heroDesign = featuredDesigns[0];
  const teaserDesign = featuredDesigns[1];
  const aboutText =
    home.aboutText?.trim() ||
    config.about?.story?.[0]?.replaceAll("{{name}}", config.name) ||
    home.description;

  // The ember word is the hero's signature: an explicit `home.headingAccent`
  // wins; otherwise the heading's last word takes the accent automatically
  // (set the studio row to an empty string to disable).
  const accentWord =
    home.headingAccent !== undefined
      ? home.headingAccent
      : home.heading.split(" ").slice(-1).join(" ");
  const headingLead =
    home.headingAccent !== undefined
      ? home.heading
      : home.heading.split(" ").slice(0, -1).join(" ");

  return (
    <>
      {/* Hero: the catalog's own artwork leads, inside the woven texture band. */}
      <section className="texture-weave bg-background" aria-labelledby="home-heading">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-10 py-14 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14 lg:py-20">
            <div>
              {home.eyebrow ? <Eyebrow className="mb-4">{home.eyebrow}</Eyebrow> : null}
              <h1
                id="home-heading"
                className="font-display text-4xl font-bold leading-[1.05] tracking-[-0.02em] text-foreground sm:text-5xl xl:text-6xl"
              >
                {headingLead}
                {accentWord ? (
                  <span className="text-accent"> {accentWord}</span>
                ) : null}
              </h1>
              <p className="mt-5 max-w-xl text-muted-foreground">{home.description}</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
                <Link href="/designs" className={buttonVariants({ className: "gap-2" })}>
                  Browse designs
                  <ArrowRight size={18} aria-hidden="true" />
                </Link>
                <AccentLink href="/collections" className="inline-flex items-center min-h-11">
                  Our collections
                </AccentLink>
              </div>
              <form
                action="/designs"
                method="get"
                role="search"
                aria-label="Search print catalog"
                className="mt-8 max-w-xl"
              >
                <label htmlFor="home-search" className="mb-2 block text-sm font-medium text-foreground">
                  Search prints
                </label>
                <div className="flex gap-2">
                  <Input
                    id="home-search"
                    name="search"
                    type="search"
                    placeholder="Try cat lover gift"
                    className="min-w-0 h-11"
                  />
                  <Button type="submit" className="min-h-11 gap-2">
                    <Search size={18} aria-hidden="true" />
                    Search
                  </Button>
                </div>
              </form>
            </div>
            {heroDesign ? (
              <ArtCard design={heroDesign} caption={home.heroCaption} priority />
            ) : null}
          </div>
        </div>
      </section>

      {/* Interest and gift chips keep their stable discovery slot under the hero. */}
      {(collections.length > 0 || giftPages.length > 0) && (
        <section className="border-y border-border bg-background">
          <div className="container mx-auto space-y-4 px-4 py-6 sm:px-6 lg:px-8">
            {collections.length > 0 && (
              <nav aria-label="Browse by interest" className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-medium text-muted-foreground">
                  Browse by interest
                </span>
                {collections.slice(0, HOME_CHIP_LIMIT).map((collection) => (
                  <LinkChip key={collection.collection} href={collectionPath(collection.collection)}>
                    {collection.heading || collection.title}
                  </LinkChip>
                ))}
                <AccentLink href="/collections" className="inline-flex items-center min-h-11 px-2 text-sm">
                  See all collections
                </AccentLink>
              </nav>
            )}
            {giftPages.length > 0 && (
              <nav aria-label="Gift ideas" className="flex flex-wrap items-center gap-2">
                <span className="mr-1 text-sm font-medium text-muted-foreground">Gift ideas</span>
                {giftPages.slice(0, HOME_CHIP_LIMIT).map((page) => (
                  <LinkChip key={page.slug} href={giftPath(page.slug)}>
                    {page.heading || page.title}
                  </LinkChip>
                ))}
                <AccentLink href="/gifts" className="inline-flex items-center min-h-11 px-2 text-sm">
                  See all gift ideas
                </AccentLink>
              </nav>
            )}
          </div>
        </section>
      )}

      {/* Featured prints on the alt band, three up on desktop. */}
      {featuredDesigns.length > 0 && (
        <section className="bg-surface" aria-labelledby="featured-heading">
          <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto mb-10 max-w-xl text-center">
              <Eyebrow className="mb-3">Original collections</Eyebrow>
              <h2
                id="featured-heading"
                className="font-display text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
              >
                Featured Designs
              </h2>
              <p className="mt-3 text-muted-foreground">
                Fresh from the catalog — witty, original designs grouped by what you love.
              </p>
            </div>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featuredDesigns.map((design) => (
                <DesignCard key={design.id} design={design} />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Philosophy band on the deepest graphite. */}
      {values.length > 0 && (
        <section className="texture-weave bg-secondary" aria-labelledby="values-heading">
          <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
            <div className="mx-auto mb-10 max-w-xl text-center">
              <Eyebrow className="mb-3">{home.valuesEyebrow}</Eyebrow>
              <h2
                id="values-heading"
                className="font-display text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
              >
                {home.valuesTitle}
              </h2>
              <p className="mt-3 text-muted-foreground">{home.valuesIntro}</p>
            </div>
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {values.map((value, index) => (
                <div key={value.title} className="rounded-lg border border-border bg-card p-5">
                  <p className="font-display text-sm font-semibold text-accent" aria-hidden="true">
                    {String(index + 1).padStart(2, "0")}
                  </p>
                  <h3 className="font-display mt-2 text-base font-semibold text-foreground">
                    {value.title}
                  </h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                    {value.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* About teaser on the field, framed artwork beside the copy. */}
      {(home.aboutTitle || aboutText) && (
        <section className="bg-background" aria-labelledby="about-teaser-heading">
          <div className="container mx-auto px-4 py-16 sm:px-6 lg:px-8">
            <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-14">
              <div>
                {home.aboutEyebrow ? <Eyebrow className="mb-4">{home.aboutEyebrow}</Eyebrow> : null}
                <h2
                  id="about-teaser-heading"
                  className="font-display max-w-lg text-3xl font-bold tracking-[-0.02em] text-foreground sm:text-4xl"
                >
                  {home.aboutTitle}
                </h2>
                <p className="mt-4 max-w-xl text-muted-foreground">{aboutText}</p>
                {aboutPoints.length > 0 && (
                  <div className="mt-8 grid gap-3 sm:grid-cols-2">
                    {aboutPoints.map((point) => (
                      <div key={point.title} className="rounded-lg border border-border p-4">
                        <h3 className="text-sm font-semibold text-foreground">{point.title}</h3>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {point.description}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                <AccentLink href="/about" className="mt-8 inline-flex items-center min-h-11">
                  More about {config.name}
                </AccentLink>
              </div>
              {teaserDesign ? <ArtCard design={teaserDesign} /> : null}
            </div>
          </div>
        </section>
      )}
    </>
  );
}
