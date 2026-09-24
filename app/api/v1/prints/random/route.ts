import { fetchRandomDesigns } from "@/utils/database";
import { jsonResponse, optionsResponse, parseIntParam, toPublicPrint } from "@/lib/public-api";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const limit = parseIntParam(searchParams.get("limit"), 3, 1, 12);
  const collection = (searchParams.get("collection") || "").trim().slice(0, 100);

  try {
    const designs = await fetchRandomDesigns(limit, collection || undefined);
    return jsonResponse(
      request,
      { items: designs.map(toPublicPrint) },
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
