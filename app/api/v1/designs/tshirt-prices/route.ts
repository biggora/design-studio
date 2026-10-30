import { NextResponse } from "next/server";
import { authorizeListingsRequest } from "@/lib/listings";
import { fetchDesigns, getDesignById, getDesignListings, fetchPublicListings } from "@/utils/database";
import { tshirtPriceSources } from "@/lib/marketplace-prices";

export const runtime = "nodejs";
const response = (value: unknown, status = 200) => NextResponse.json(value, { status, headers: { "Cache-Control": "no-store" } });

/** Canonical source links for the offline collector; never fetches a marketplace. */
export async function GET(request: Request) {
  const denied = authorizeListingsRequest(request);
  if (denied) return denied;
  const params = new URL(request.url).searchParams;
  const page = Number(params.get("page") ?? 1), limit = Number(params.get("limit") ?? 50), id = params.get("id");
  const sha256=params.get('sha256');
  if (sha256 && (!/^[a-f0-9]{64}$/i.test(sha256) || id)) return response({error:'Invalid parameters'},400);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100 || (id && !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id))) return response({ error: "Invalid parameters" }, 400);
  try {
    const linked = sha256 ? await getDesignListings({sha256}) : null;
    if(sha256 && !linked)return response({error:'Design not found'},404);
    const result = id || sha256 ? await getDesignById(id || linked?.design.id || '') : null;
    if ((id || sha256) && !result) return response({ error: "Design not found" }, 404);
    const { designs, total } = result ? { designs: [result.design], total: 1 } : await fetchDesigns(page, "", "", limit);
    const listings = await fetchPublicListings(designs.map(design => design.id),true);
    return response({ items: designs.map(design => ({ designId: design.id, title: design.title, ...(design.sha256 ? {sha256:design.sha256} : {}), sources: tshirtPriceSources(design, listings[design.id] || []) })), total, page, limit });
  } catch (error) {
    console.error("Price source API error:", error);
    return response({ error: "Internal server error" }, 500);
  }
}
