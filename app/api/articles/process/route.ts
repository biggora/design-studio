import { authorizeArticleRequest } from "@/lib/sync-auth";
import { ArticleScheduleError } from "@/lib/article-scheduling";
import {
  articleScheduleFailure,
  articleScheduleJson,
  revalidateArticlePages,
} from "@/lib/article-schedule-http";
import { processArticleAnnouncements } from "@/utils/database";

export const maxDuration = 60;

export async function POST(request: Request) {
  const denied = authorizeArticleRequest(request);
  if (denied) return denied;
  try {
    const limit = Number(new URL(request.url).searchParams.get("limit") ?? 25);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100)
      throw new ArticleScheduleError("limit must be 1–100");
    try {
      return articleScheduleJson(await processArticleAnnouncements({ limit }));
    } finally {
      // A partial batch may already have released a card even if another database write fails.
      revalidateArticlePages();
    }
  } catch (error) {
    return articleScheduleFailure(error);
  }
}

// Vercel Cron invokes GET. Authorization uses the existing article API credentials.
export const GET = POST;
