import { fetchDesigns } from "@/utils/database";
import { isValidBackgroundValue } from "@/lib/background";
import {
  jsonResponse,
  optionsResponse,
  parseIntParam,
  parseKeywordsParam,
  toPublicPrint,
} from "@/lib/public-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const page = parseIntParam(searchParams.get("page"), 1, 1, 10000);
  const limit = parseIntParam(searchParams.get("limit"), 12, 1, 50);
  const q = (searchParams.get("q") || "").trim().slice(0, 100);
  const collection = (searchParams.get("collection") || "").trim().slice(0, 100);
  const keywords = parseKeywordsParam(searchParams.get("keywords"));
  const bg = searchParams.get("bg");
  if (bg !== null && !isValidBackgroundValue(bg)) {
    return jsonResponse(request, { error: "Invalid bg" }, { status: 400 });
  }

  try {
    const { designs, total } = await fetchDesigns(page, q, collection, limit, keywords);
    return jsonResponse(request, {
      items: designs.map(design => toPublicPrint(design, bg || undefined)),
      page,
      limit,
      total,
    });
  } catch (err) {
    console.error("Error fetching prints:", err);
    return jsonResponse(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}
