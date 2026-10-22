import { NextResponse } from "next/server";
import { setDesignCdnImage, getDesignCdnImage } from "@/utils/database";
import {
  authorizeListingsRequest, ListingsError, listingsErrorResponse,
  parseCdnImageBatch, parseCdnImageLookup,
} from "@/lib/listings";

export const runtime = "nodejs";

function failure(error: unknown): NextResponse {
  if (error instanceof ListingsError) return listingsErrorResponse(error);
  console.error("cdn-image API error:", error);
  return listingsErrorResponse(new ListingsError(500, "INTERNAL", "Internal server error"));
}

export async function PUT(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch {
    return listingsErrorResponse(new ListingsError(400, "VALIDATION", "Invalid JSON body"));
  }
  try {
    const results = await setDesignCdnImage(parseCdnImageBatch(body));
    return NextResponse.json({
      results, updated: results.filter(result => result.status === "updated").length,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const result = await getDesignCdnImage(parseCdnImageLookup(new URL(request.url).searchParams));
    if (!result) return listingsErrorResponse(new ListingsError(404, "NOT_FOUND", "Design not found"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
