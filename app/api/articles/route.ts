import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { parseArticleAnnouncement } from "@/lib/articles";
import { upsertArticleAnnouncement } from "@/utils/database";

export async function PUT(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  let article;
  try {
    article = parseArticleAnnouncement(await request.json());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid article" },
      { status: 400 },
    );
  }
  try {
    await upsertArticleAnnouncement(article);
    revalidatePath("/articles");
    revalidatePath("/sitemap.xml");
    return NextResponse.json(
      { sourceArticleId: article.sourceArticleId, saved: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not save the article announcement" },
      { status: 500 },
    );
  }
}
