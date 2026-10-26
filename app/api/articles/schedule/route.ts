import { authorizeSyncRequest } from "@/lib/sync-auth";
import {
  articleScheduleView,
  ArticleScheduleError,
  parseArticleShowAt,
  parseArticleStatus,
  parseArticleTarget,
} from "@/lib/article-scheduling";
import {
  articleScheduleFailure,
  articleScheduleJson,
  revalidateArticlePages,
} from "@/lib/article-schedule-http";
import {
  fetchArticleAnnouncements,
  setArticleSchedule,
} from "@/utils/database";

export async function GET(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  try {
    const params = new URL(request.url).searchParams;
    if (params.has("sourceArticleId") || params.has("blog")) {
      const target = parseArticleTarget({
        blog: params.get("blog"),
        sourceArticleId: params.get("sourceArticleId"),
      });
      const [row] = await fetchArticleAnnouncements(target);
      if (!row)
        throw new ArticleScheduleError("Article announcement not found", 404);
      return articleScheduleJson(articleScheduleView(row));
    }
    const page = Number(params.get("page") ?? 1);
    const limit = Number(params.get("limit") ?? 25);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      !Number.isSafeInteger(limit) ||
      limit < 1 ||
      limit > 100
    )
      throw new ArticleScheduleError(
        "page must be positive; limit must be 1–100",
      );
    const status = parseArticleStatus(params.get("status"));
    const rows = (await fetchArticleAnnouncements()).filter(
      (row) => !status || (row.status ?? "automatic") === status,
    );
    return articleScheduleJson({
      data: rows
        .slice((page - 1) * limit, page * limit)
        .map((row) => articleScheduleView(row)),
      pagination: { page, limit, total: rows.length },
    });
  } catch (error) {
    return articleScheduleFailure(error);
  }
}

export async function PUT(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  try {
    const input = await request.json();
    const target = parseArticleTarget(input);
    const row = await setArticleSchedule(
      target,
      "schedule",
      parseArticleShowAt(input.showAt),
    );
    revalidateArticlePages();
    return articleScheduleJson(articleScheduleView(row));
  } catch (error) {
    return articleScheduleFailure(error);
  }
}

export async function DELETE(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;
  try {
    const row = await setArticleSchedule(
      parseArticleTarget(await request.json()),
      "cancel",
    );
    revalidateArticlePages();
    return articleScheduleJson(articleScheduleView(row));
  } catch (error) {
    return articleScheduleFailure(error);
  }
}
