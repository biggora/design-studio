import { NextResponse } from "next/server";
import crypto from "node:crypto";

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getSecretFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const syncSecretHeader = request.headers.get("x-sync-secret");
  if (syncSecretHeader) {
    return syncSecretHeader.trim();
  }

  return null;
}

export function authorizeSyncRequest(request: Request): NextResponse | null {
  const expected = process.env.SYNC_SECRET;
  if (!expected || expected.trim().length === 0) {
    return NextResponse.json(
      { error: "SYNC_SECRET is not configured" },
      { status: 500 },
    );
  }

  const provided = getSecretFromRequest(request);
  if (!provided || !constantTimeCompare(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
