import { NextResponse } from "next/server";
import { cache } from "react";
import { getDesignBySlug, getDesignById } from "@/utils/database";
import { getDesignDisplayImage } from "@/lib/image";
import { isAllowedPinSourceImage, renderPinImage } from "@/lib/pin-image";
import { UUID_PATTERN, SLUG_PATTERN } from "@/lib/slug";

/**
 * GET /p/[slug]/pin.jpg — the 1000×1500 (2:3) pin image for a design.
 *
 * The mockup is fetched server-side from the allow-listed Redbubble image host
 * (Pinterest only ever sees this threadquirk.lv URL — every feed URL must stay
 * on the claimed domain). The optional ?v= version param from the feed is
 * ignored here; it exists purely so a changed design gets a fresh URL past
 * caches. Upstream failures answer 503 with no-store so the CDN never pins a
 * broken image.
 */

const PIN_CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate";
const UPSTREAM_TIMEOUT_MS = 10_000;

// Per-request dedupe: metadata, page and pin route share the same lookup shape.
const loadDesign = cache(async (param: string) => {
  if (UUID_PATTERN.test(param)) return getDesignById(param);
  if (param.length > 255 || !SLUG_PATTERN.test(param)) return null;
  return getDesignBySlug(param);
});

function notFoundResponse(): NextResponse {
  return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;
  const data = await loadDesign(slug);
  if (!data || !data.design) {
    return notFoundResponse();
  }

  const sourceUrl = getDesignDisplayImage(data.design).trim();
  if (!sourceUrl || !isAllowedPinSourceImage(sourceUrl)) {
    return notFoundResponse();
  }

  let image: Uint8Array;
  try {
    // no-store: skip Next's fetch data cache — binary responses don't belong in
    // it, and the pinned HTTP cache-control below is our caching layer.
    const upstream = await fetch(sourceUrl, {
      cache: "no-store",
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      throw new Error(`Upstream responded ${upstream.status}`);
    }
    const buffer = await upstream.arrayBuffer();
    if (!buffer.byteLength) {
      throw new Error("Upstream returned an empty image");
    }
    image = new Uint8Array(buffer);
  } catch (err) {
    console.error("Error fetching pin source image:", err);
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const jpeg = await renderPinImage({
      image,
      title: data.design.title,
      backgroundColor: data.design.backgroundColor,
    });
    return new NextResponse(new Uint8Array(jpeg), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": PIN_CACHE_CONTROL,
        // The feed's XSL preview loads pins from an XSLT-generated document,
        // which Chromium treats as an opaque-origin initiator: without CORS the
        // response is subject to ORB and the thumbnail is blocked.
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    console.error("Error rendering pin image:", err);
    return new NextResponse(null, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
