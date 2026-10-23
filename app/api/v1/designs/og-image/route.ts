import { NextResponse } from "next/server";
import { getOgContexts, setOgImage, getSiteConfig } from "@/utils/database";
import {
  authorizeListingsRequest,
  ListingsError,
  listingsErrorResponse,
} from "@/lib/listings";
import { parseOgLookup, parseOgWrite } from "@/lib/og-image";
export const runtime = "nodejs";
function failure(error: unknown) {
  if (error instanceof ListingsError) return listingsErrorResponse(error);
  console.error("og-image API error", error);
  return listingsErrorResponse(
    new ListingsError(500, "INTERNAL", "Internal server error"),
  );
}
const response = (value: unknown, status = 200) =>
  NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams,
      lookup = parseOgLookup(params);
    const page = Number(params.get("page") ?? 1),
      limit = Number(params.get("limit") ?? 50);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ListingsError(400, "VALIDATION", "Invalid pagination");
    const config = await getSiteConfig();
    const result = await getOgContexts(lookup, page, limit, config.domain);
    if (lookup)
      return result.items[0]
        ? response(result.items[0])
        : listingsErrorResponse(
            new ListingsError(404, "NOT_FOUND", "Design not found"),
          );
    return response(result);
  } catch (e) {
    return failure(e);
  }
}
export async function PUT(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw) > 64 * 1024)
      throw new ListingsError(400, "VALIDATION", "Body too large");
    let body: unknown;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new ListingsError(400, "VALIDATION", "Invalid JSON");
    }
    const write = parseOgWrite(body);
    const result = await setOgImage(write);
    return response(
      result,
      result.status === "conflict"
        ? 409
        : result.status === "not_found"
          ? 404
          : 200,
    );
  } catch (e) {
    return failure(e);
  }
}
