import { fetchRandomDesigns, getSiteConfig } from "@/utils/database";
import { isValidBackgroundValue } from "@/lib/background";
import { getAffiliateOptions } from "@/lib/affiliate";
import {
  jsonResponse,
  optionsResponse,
  parseIntParam,
  parseKeywordsParam,
  toPublicPrint,
} from "@/lib/public-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = parseIntParam(searchParams.get("limit"), 3, 1, 12);
  const collection = (searchParams.get("collection") || "").trim().slice(0, 100);
  const keywords = parseKeywordsParam(searchParams.get("keywords"));
  const bg = searchParams.get("bg");
  if (bg !== null && !isValidBackgroundValue(bg)) {
    return jsonResponse(request, { error: "Invalid bg" }, { status: 400 });
  }

  try {
    const [designs, config] = await Promise.all([
      fetchRandomDesigns(limit, collection || undefined, keywords),
      getSiteConfig(),
    ]);
    const affiliate = getAffiliateOptions(config);
    return jsonResponse(
      request,
      { items: designs.map(design => toPublicPrint(design, bg || undefined, affiliate)) },
      { cache: "no-store" },
    );
  } catch (err) {
    console.error("Error fetching random prints:", err);
    return jsonResponse(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}
