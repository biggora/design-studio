import { getDesignById } from "@/utils/database";
import { jsonResponse, optionsResponse, toPublicPrint } from "@/lib/public-api";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (id.length > 100) {
    return jsonResponse(request, { error: "Invalid id" }, { status: 400 });
  }

  try {
    const result = await getDesignById(id);
    if (!result) {
      return jsonResponse(request, { error: "Not found" }, { status: 404 });
    }
    return jsonResponse(request, { item: toPublicPrint(result.design) });
  } catch (err) {
    console.error("Error fetching print:", err);
    return jsonResponse(request, { error: "Internal server error" }, { status: 500 });
  }
}

export async function OPTIONS(request: Request) {
  return optionsResponse(request);
}
