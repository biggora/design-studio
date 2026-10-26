import { authorizeSyncRequest } from "@/lib/sync-auth";
import {
  ArticleScheduleError,
  articleScheduleView,
  parseArticleTarget,
} from "@/lib/article-scheduling";
import {
  articleScheduleFailure,
  articleScheduleJson,
  revalidateArticlePages,
} from "@/lib/article-schedule-http";
import {
  fetchArticleAnnouncements,
  processArticleAnnouncements,
  setArticleSchedule,
} from "@/utils/database";

export async function POST(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  try {
    const target = parseArticleTarget(await request.json());
    await setArticleSchedule(target, "now");
    // Invalidate before the network check too, so a failed check cannot leave an old card cached.
    revalidateArticlePages();
    try {
      const processing = await processArticleAnnouncements({ target });
      const [row] = await fetchArticleAnnouncements(target);
      if (!row)
        throw new ArticleScheduleError("Article announcement not found", 404);
      return articleScheduleJson({
        article: articleScheduleView(row),
        processing,
      });
    } finally {
      revalidateArticlePages();
    }
  } catch (error) {
    return articleScheduleFailure(error);
  }
}
