import { describe, expect, it } from "vitest";
import {
  articleIsDue,
  articleIsVisible,
  articleScheduleView,
  parseArticleShowAt,
} from "./article-scheduling";
import type { ArticleRecord } from "./articles";

const now = Date.parse("2026-10-26T10:00:00Z");
const row = {
  status: "scheduled",
  showAt: "2026-10-26T11:00:00Z",
  checkedAt: null,
  publication: { title: "An old cached card" },
} as ArticleRecord;
describe("website announcement time", () => {
  it("converts an explicit offset to UTC", () => {
    expect(parseArticleShowAt("2026-10-26T12:30:00+02:00")).toBe(
      "2026-10-26T10:30:00.000Z",
    );
    expect(parseArticleShowAt("2026-10-26T10:30:00Z")).toBe(
      "2026-10-26T10:30:00.000Z",
    );
  });
  it.each([
    null,
    "2026-10-26T12:30:00",
    "2026-02-30T12:30:00Z",
    "2026-10-26T24:00:00Z",
    "2026-10-26T10:30:00+25:00",
  ])("rejects invalid or timezone-free values: %s", (value) => {
    expect(() => parseArticleShowAt(value)).toThrow();
  });
  it("never exposes future, cancelled, or invalid schedules even with a stale public snapshot", () => {
    for (const candidate of [
      row,
      { ...row, status: "cancelled" },
      { ...row, showAt: "bad" },
      { ...row, showAt: null },
      { ...row, status: "published" },
    ]) {
      expect(articleIsVisible(candidate as ArticleRecord, now)).toBe(false);
      expect(articleIsDue(candidate as ArticleRecord, now)).toBe(false);
    }
  });
  it("keeps unscheduled legacy rows visible and distinguishes website schedule state", () => {
    expect(
      articleIsVisible({ ...row, status: undefined, showAt: null }, now),
    ).toBe(true);
    expect(articleScheduleView(row, now).state).toBe("waiting_time");
    const due = { ...row, showAt: "2026-10-26T09:00:00Z", publication: null };
    expect(articleIsVisible(due, now)).toBe(true);
    expect(articleScheduleView(due, now).state).toBe("published");
    expect(
      articleScheduleView(
        { ...row, showAt: "2026-10-26T09:00:00Z", lastError: "unavailable" },
        now,
      ).state,
    ).toBe("published");
  });
});
