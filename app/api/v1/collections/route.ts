import { fetchCollections } from "@/utils/database";
import { jsonResponse, optionsResponse } from "@/lib/public-api";

export async function GET(request: Request) {
  try {
    const items = await fetchCollections();
    return jsonResponse(request, { items });
  } catch (err) {
    console.error("Error fetching collections:", err);
    return jsonResponse(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}
