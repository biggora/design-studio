import { NextResponse } from "next/server";
import { summarizeSocialPosts } from "@/utils/database";
import { authorizeListingsRequest, ListingsError, listingsErrorResponse } from "@/lib/listings";
import { parseSummaryQuery } from "@/lib/social-posts";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const data = await summarizeSocialPosts(parseSummaryQuery(new URL(request.url).searchParams));
    return NextResponse.json({ data }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof ListingsError) return listingsErrorResponse(error);
    console.error("Social posts API error:", error);
    return listingsErrorResponse(new ListingsError(500, "INTERNAL", "Internal server error"));
  }
}
