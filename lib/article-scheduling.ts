import {
  ARTICLE_STATUSES,
  type ArticleRecord,
  type ArticleStatus,
  type ArticleTarget,
} from "@/lib/articles";

export class ArticleScheduleError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 = 400,
  ) {
    super(message);
  }
}

export function parseArticleTarget(value: unknown): ArticleTarget {
  const input = value as Partial<ArticleTarget> | null;
  if (
    !input ||
    typeof input.blog !== "string" ||
    !/^[a-z0-9-]+\.tumblr\.com$/.test(input.blog) ||
    input.blog.length > 253 ||
    typeof input.sourceArticleId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,100}$/.test(input.sourceArticleId)
  ) {
    throw new ArticleScheduleError("Provide blog and sourceArticleId");
  }
  return { blog: input.blog, sourceArticleId: input.sourceArticleId };
}

/** RFC3339 only: an explicit UTC marker or numeric offset is mandatory. */
export function parseArticleShowAt(value: unknown): string {
  if (typeof value !== "string")
    throw new ArticleScheduleError(
      "showAt must include a timezone (Z or ±HH:MM)",
    );
  const parts = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/,
  );
  const time = Date.parse(value);
  if (!parts || !Number.isFinite(time))
    throw new ArticleScheduleError(
      "Invalid showAt; use ISO 8601 with Z or ±HH:MM",
    );
  const [, year, month, day, hour, minute, second, , offsetHour, offsetMinute] =
    parts;
  const days = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
  if (
    Number(year) < 1000 ||
    Number(month) < 1 ||
    Number(month) > 12 ||
    Number(day) < 1 ||
    Number(day) > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59 ||
    Number(offsetHour ?? 0) > 23 ||
    Number(offsetMinute ?? 0) > 59
  ) {
    throw new ArticleScheduleError("Invalid calendar date in showAt");
  }
  return new Date(time).toISOString();
}

export function articleTimeReached(row: ArticleRecord, now: number): boolean {
  if (row.status === "scheduled" && !row.showAt) return false;
  return (
    row.showAt == null ||
    (Number.isFinite(Date.parse(row.showAt)) && Date.parse(row.showAt) <= now)
  );
}

export function articleIsVisible(
  row: ArticleRecord,
  now = Date.now(),
): boolean {
  return (
    (row.status == null ||
      row.status === "automatic" ||
      row.status === "published") &&
    articleTimeReached(row, now) &&
    row.publication !== null
  );
}

export function articleIsDue(
  row: ArticleRecord,
  now: number,
  includeScheduled = true,
): boolean {
  const status = row.status ?? "automatic";
  if (
    !ARTICLE_STATUSES.includes(status) ||
    status === "cancelled" ||
    (!includeScheduled && status === "scheduled") ||
    !articleTimeReached(row, now)
  )
    return false;
  return (
    !row.checkedAt ||
    now - Date.parse(row.checkedAt) >=
      (status === "scheduled" ? 60_000 : 300_000)
  );
}

export function articleScheduleView(row: ArticleRecord, now = Date.now()) {
  const status = row.status ?? "automatic";
  const state =
    status === "cancelled"
      ? "cancelled"
      : !articleTimeReached(row, now)
        ? "waiting_time"
        : row.lastError
          ? "verification_error"
          : articleIsVisible(row, now)
            ? "published"
            : "waiting_tumblr";
  return {
    ...row,
    status,
    showAt: row.showAt ?? null,
    shownAt: row.shownAt ?? null,
    lastError: row.lastError ?? null,
    state,
  };
}

export function parseArticleStatus(
  value: string | null,
): ArticleStatus | undefined {
  if (value === null) return undefined;
  if (!ARTICLE_STATUSES.includes(value as ArticleStatus))
    throw new ArticleScheduleError("Invalid status filter");
  return value as ArticleStatus;
}
