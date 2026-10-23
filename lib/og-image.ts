import {
  assignmentSchema,
  assetSchema,
  ogSchema,
  assetKey,
  canonical,
} from "@pod/og-renderer/contract";
import type {
  Assignment,
  Asset,
  OgContext,
  OgImage,
} from "@pod/og-renderer/contract";
import { ListingsError } from "@/lib/listings";
export type { OgContext, OgImage };

export function normalizeOgImage(value: unknown): OgImage | null {
  try {
    return ogSchema.parse(
      typeof value === "string" ? JSON.parse(value) : value,
    );
  } catch {
    return null;
  }
}
export type OgLookup = {
  id?: string;
  sha256?: string;
  sourceImageId?: number;
  redbubbleId?: string;
};
export type OgWrite =
  | { designId: string; operation: "assign"; assignment: Assignment }
  | {
      designId: string;
      operation: "ready";
      assignmentHash: string;
      asset: Asset;
    };
export type OgWriteResult = {
  status: "created" | "unchanged" | "ready" | "conflict" | "not_found";
  ogImage: OgImage | null;
};
const invalid = (message: string): never => {
  throw new ListingsError(400, "VALIDATION", message);
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export { parsePinLookup as parseOgLookup } from "@/lib/pinterest-image";
export function parseOgWrite(value: unknown): OgWrite {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return invalid("Expected an object");
  const v = value as Record<string, unknown>;
  if (typeof v.designId !== "string" || !uuid.test(v.designId))
    return invalid("Invalid designId");
  const allowed =
    v.operation === "assign"
      ? ["designId", "operation", "assignment"]
      : ["designId", "operation", "assignmentHash", "asset"];
  if (Object.keys(v).some((k) => !allowed.includes(k)))
    return invalid("Unknown field");
  if (v.operation === "assign") {
    const p = assignmentSchema.safeParse(v.assignment);
    if (!p.success || p.data.designId !== v.designId)
      return invalid("Invalid assignment");
    return { designId: v.designId, operation: "assign", assignment: p.data };
  }
  if (
    v.operation === "ready" &&
    typeof v.assignmentHash === "string" &&
    /^[a-f0-9]{64}$/.test(v.assignmentHash)
  ) {
    const p = assetSchema.safeParse(v.asset);
    if (
      !p.success ||
      p.data.key !==
        assetKey({ designId: v.designId, hash: v.assignmentHash } as Assignment)
    )
      return invalid("Invalid asset");
    return {
      designId: v.designId,
      operation: "ready",
      assignmentHash: v.assignmentHash,
      asset: p.data,
    };
  }
  return invalid("Invalid operation");
}

export function applyOgWrite(
  stored: OgImage | null,
  write: OgWrite,
): OgWriteResult {
  if (write.operation === "assign") {
    if (!stored)
      return {
        status: "created",
        ogImage: { assignment: write.assignment, asset: null },
      };
    return {
      status:
        stored.assignment.hash === write.assignment.hash
          ? "unchanged"
          : "conflict",
      ogImage: stored,
    };
  }
  if (!stored || stored.assignment.hash !== write.assignmentHash)
    return { status: "conflict", ogImage: stored };
  if (stored.asset)
    return {
      status:
        canonical(stored.asset) === canonical(write.asset)
          ? "unchanged"
          : "conflict",
      ogImage: stored,
    };
  return { status: "ready", ogImage: { ...stored, asset: write.asset } };
}
