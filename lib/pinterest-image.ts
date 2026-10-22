import {
  assignmentSchema,
  assetSchema,
  pinSchema,
  assetKey,
  canonical,
} from "@pod/pinterest-renderer/contract";
import type {
  Assignment,
  Asset,
  PinContext,
  PinterestImage,
} from "@pod/pinterest-renderer/contract";
import { ListingsError } from "@/lib/listings";
export type { PinContext, PinterestImage };

export function normalizePinterestImage(value: unknown): PinterestImage | null {
  try {
    return pinSchema.parse(
      typeof value === "string" ? JSON.parse(value) : value,
    );
  } catch {
    return null;
  }
}
export type PinLookup = {
  id?: string;
  sha256?: string;
  sourceImageId?: number;
  redbubbleId?: string;
};
export type PinWrite =
  | { designId: string; operation: "assign"; assignment: Assignment }
  | {
      designId: string;
      operation: "ready";
      assignmentHash: string;
      asset: Asset;
    };
export type PinWriteResult = {
  status: "created" | "unchanged" | "ready" | "conflict" | "not_found";
  pinterestImage: PinterestImage | null;
};
const invalid = (message: string): never => {
  throw new ListingsError(400, "VALIDATION", message);
};
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parsePinLookup(params: URLSearchParams): PinLookup | null {
  const allowed = ["id", "sha256", "sourceImageId", "redbubbleId"];
  if (
    [...params.keys()].some((k) => ![...allowed, "page", "limit"].includes(k))
  )
    invalid("Unknown query parameter");
  const keys = allowed.filter((k) => params.has(k));
  if (!keys.length) return null;
  if (params.has("page") || params.has("limit"))
    invalid("Lookup and pagination cannot be combined");
  const out: PinLookup = {};
  for (const key of keys) {
    const value = params.get(key)!;
    if (params.getAll(key).length !== 1) invalid("Duplicate identifier");
    if (key === "id") {
      if (!uuid.test(value)) invalid("Invalid id");
      out.id = value;
    }
    if (key === "sha256") {
      if (!/^[a-f0-9]{64}$/i.test(value)) invalid("Invalid sha256");
      out.sha256 = value.toLowerCase();
    }
    if (key === "sourceImageId" || key === "redbubbleId") {
      if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value)))
        invalid("Invalid numeric identifier");
      if (key === "sourceImageId") out.sourceImageId = Number(value);
      else out.redbubbleId = value;
    }
  }
  return out;
}
export function parsePinWrite(value: unknown): PinWrite {
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

export function applyPinWrite(
  stored: PinterestImage | null,
  write: PinWrite,
): PinWriteResult {
  if (write.operation === "assign") {
    if (!stored)
      return {
        status: "created",
        pinterestImage: { assignment: write.assignment, asset: null },
      };
    return {
      status:
        stored.assignment.hash === write.assignment.hash
          ? "unchanged"
          : "conflict",
      pinterestImage: stored,
    };
  }
  if (!stored || stored.assignment.hash !== write.assignmentHash)
    return { status: "conflict", pinterestImage: stored };
  if (stored.asset)
    return {
      status:
        canonical(stored.asset) === canonical(write.asset)
          ? "unchanged"
          : "conflict",
      pinterestImage: stored,
    };
  return { status: "ready", pinterestImage: { ...stored, asset: write.asset } };
}
