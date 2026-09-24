import { NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { SITE_CONFIG_TAG } from "@/utils/database";

export async function POST(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;

  revalidateTag(SITE_CONFIG_TAG, "max");
  return NextResponse.json({ revalidated: true, tag: SITE_CONFIG_TAG });
}
