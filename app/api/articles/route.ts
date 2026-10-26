import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { parseArticleAnnouncement } from "@/lib/articles";
import { upsertArticleAnnouncement } from "@/utils/database";
import { parseArticleShowAt } from "@/lib/article-scheduling";

export async function PUT(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  let article;
  let showAt: string | undefined;
  try {
    const input = await request.json();
    article = parseArticleAnnouncement(input);
    if (Object.hasOwn(input, "showAt"))
      showAt = parseArticleShowAt(input.showAt);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid article" },
      { status: 400 },
    );
  }
  try {
    if (showAt === undefined) await upsertArticleAnnouncement(article);
    else await upsertArticleAnnouncement(article, showAt);
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
