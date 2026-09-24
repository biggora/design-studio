import { NextResponse } from "next/server";
import { Design } from "@/types/design";

export type PublicPrint = {
  id: string;
  title: string;
  description: string;
  imageUrl: string;
  mockupUrl: string | null;
  link: string;
  collection: string | null;
  keywords: string[];
  backgroundColor: string | null;
};

export function toPublicPrint(design: Design): PublicPrint {
  const collection =
    design.collection && design.collection !== "no_collection" ? design.collection : null;

  const keywords = design.keywords
    ? design.keywords
        .split(",")
        .map(keyword => keyword.trim())
        .filter(Boolean)
    : [];

  return {
    id: design.id,
    title: design.title,
    description: design.description,
    imageUrl: design.externalImageUrl,
    mockupUrl: (design.props as { mockup_tshirt?: string })?.mockup_tshirt ?? null,
    link: design.externalLink,
    collection,
    keywords,
    backgroundColor: design.backgroundColor || null,
  };
}

export function getAllowedOrigins(): string[] {
  const raw = process.env.PRINTS_API_ALLOWED_ORIGINS || "";
  const origins = raw
    .split(",")
    .map(origin => origin.trim().replace(/\/+$/, ""))
    .filter(Boolean);
  return origins.length > 0 ? origins : ["*"];
}

export function corsHeaders(request: Request): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  const allowedOrigins = getAllowedOrigins();
  const requestOrigin = request.headers.get("origin");

  let allowOrigin: string | null = null;
  if (allowedOrigins.includes("*")) {
    allowOrigin = "*";
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin.replace(/\/+$/, ""))) {
    allowOrigin = requestOrigin;
  }

  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
    headers["Access-Control-Allow-Methods"] = "GET, OPTIONS";
    headers["Access-Control-Allow-Headers"] = "Content-Type";
    headers["Access-Control-Max-Age"] = "86400";
  }

  return headers;
}

export function jsonResponse(
  request: Request,
  body: unknown,
  options?: { status?: number; cache?: "public" | "no-store" },
): NextResponse {
  const status = options?.status ?? 200;
  const cache = options?.cache ?? "public";
  const cacheControl =
    status >= 400 || cache === "no-store"
      ? "no-store"
      : "public, s-maxage=300, stale-while-revalidate=600";

  return NextResponse.json(body, {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": cacheControl,
    },
  });
}

export function optionsResponse(request: Request): NextResponse {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export function parseIntParam(value: string | null, def: number, min: number, max: number): number {
  if (value === null) return def;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return def;
  return Math.max(min, Math.min(max, parsed));
}

const KEYWORD_PATTERN = /^[\p{L}\p{N} _-]{1,50}$/u;

export function parseKeywordsParam(value: string | null): string[] {
  if (!value) return [];

  const seen = new Set<string>();
  const result: string[] = [];

  for (const raw of value.split(",")) {
    const keyword = raw.trim().toLowerCase();
    if (!keyword || !KEYWORD_PATTERN.test(keyword) || seen.has(keyword)) continue;
    seen.add(keyword);
    result.push(keyword);
    if (result.length >= 10) break;
  }

  return result;
}
