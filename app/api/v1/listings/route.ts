import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ingestListing, getDesignListings } from "@/utils/database";
import {
  authorizeListingsRequest, ListingsError, listingsErrorResponse,
  parseIngestInput, parseListingLookup,
} from "@/lib/listings";

export const runtime = "nodejs";

function failure(error: unknown): NextResponse {
  if (error instanceof ListingsError) return listingsErrorResponse(error);
  console.error("Listings API error:", error);
  return listingsErrorResponse(new ListingsError(500, "INTERNAL", "Internal server error"));
}

export async function POST(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  let body: unknown;
  try { body = await request.json(); } catch {
    return listingsErrorResponse(new ListingsError(400, "VALIDATION", "Invalid JSON body"));
  }
  try {
    const result = await ingestListing(parseIngestInput(body));
    revalidatePath("/", "layout");
    return NextResponse.json(result, {
      status: result.created.listing ? 201 : 200, headers: { "Cache-Control": "no-store" },
    });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const result = await getDesignListings(parseListingLookup(new URL(request.url).searchParams));
    if (!result) return listingsErrorResponse(new ListingsError(404, "NOT_FOUND", "Design not found"));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
