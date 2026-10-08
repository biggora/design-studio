import { NextResponse } from "next/server";
import { upsertSocialPost, listSocialPosts } from "@/utils/database";
import { authorizeListingsRequest, ListingsError, listingsErrorResponse } from "@/lib/listings";
import { parseSocialPostInput, parseSocialPostQuery } from "@/lib/social-posts";

export const runtime = "nodejs";

function failure(error: unknown): NextResponse {
  if (error instanceof ListingsError) return listingsErrorResponse(error);
  console.error("Social posts API error:", error);
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
    const result = await upsertSocialPost(parseSocialPostInput(body));
    return NextResponse.json(result, { status: result.created ? 201 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}

export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const result = await listSocialPosts(parseSocialPostQuery(new URL(request.url).searchParams));
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return failure(error); }
}
