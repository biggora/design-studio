import { describe, it, expect } from "vitest";
import { designSlugBase, uniqueSlug, planSlugBackfill, designPath } from "@/lib/slug";

// designSlugBase

describe("designSlugBase", () => {
  it("slugifies an ASCII title", () => {
    expect(designSlugBase("Funny Cat — Poster!", 42)).toBe("funny-cat-poster");
  });

  it("strips diacritics", () => {
    expect(designSlugBase("Café Noir", 1)).toBe("cafe-noir");
  });

  it("falls back to design-<externalId> for a title with no ASCII characters", () => {
    expect(designSlugBase("Кот", 123)).toBe("design-123");
  });

  it("caps the slug at 200 characters without a trailing hyphen", () => {
    const longTitle = "word ".repeat(60).trim(); // way over 200 chars once slugified
    const result = designSlugBase(longTitle, 5);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("-")).toBe(false);
  });

  it("falls back to design-<externalId> when the title is UUID-shaped", () => {
    expect(designSlugBase("123e4567-e89b-12d3-a456-426614174000", 77)).toBe("design-77");
  });
});

// uniqueSlug

describe("uniqueSlug", () => {
  it("returns the base slug when free", () => {
    expect(uniqueSlug("funny-cat-poster", new Set())).toBe("funny-cat-poster");
  });

  it("returns base-2 when the base is taken", () => {
    expect(uniqueSlug("funny-cat-poster", new Set(["funny-cat-poster"]))).toBe(
      "funny-cat-poster-2",
    );
  });

  it("returns base-3 when base and base-2 are taken", () => {
    expect(
      uniqueSlug("funny-cat-poster", new Set(["funny-cat-poster", "funny-cat-poster-2"])),
    ).toBe("funny-cat-poster-3");
  });
});

// planSlugBackfill

describe("planSlugBackfill", () => {
  it("reserves existing slugs and skips non-null rows", () => {
    const rows = [
      { id: "1", externalId: 1, title: "Design A", slug: "design-a" },
      { id: "2", externalId: 2, title: "Design B", slug: null },
    ];
    const plan = planSlugBackfill(rows);
    expect(plan).toEqual([{ id: "2", slug: "design-b" }]);
  });

  it("assigns the bare slug to the oldest row among duplicates in row order", () => {
    const rows = [
      { id: "1", externalId: 1, title: "Same Title", slug: null },
      { id: "2", externalId: 2, title: "Same Title", slug: null },
    ];
    const plan = planSlugBackfill(rows);
    expect(plan).toEqual([
      { id: "1", slug: "same-title" },
      { id: "2", slug: "same-title-2" },
    ]);
  });

  it("skips over an existing slug that collides with a would-be base", () => {
    const rows = [
      { id: "1", externalId: 1, title: "Same Title", slug: "same-title" },
      { id: "2", externalId: 2, title: "Same Title", slug: null },
    ];
    const plan = planSlugBackfill(rows);
    expect(plan).toEqual([{ id: "2", slug: "same-title-2" }]);
  });

  it("returns an empty plan when every row already has a slug", () => {
    const rows = [{ id: "1", externalId: 1, title: "Design A", slug: "design-a" }];
    expect(planSlugBackfill(rows)).toEqual([]);
  });
});

// designPath

describe("designPath", () => {
  it("uses the slug when set", () => {
    expect(designPath({ id: "uuid-1", slug: "funny-cat-poster" })).toBe(
      "/designs/funny-cat-poster",
    );
  });

  it("falls back to the id when slug is null", () => {
    expect(designPath({ id: "uuid-1", slug: null })).toBe("/designs/uuid-1");
  });

  it("falls back to the id when slug is undefined", () => {
    expect(designPath({ id: "uuid-1" })).toBe("/designs/uuid-1");
  });

  it("falls back to the id when slug is an empty string", () => {
    expect(designPath({ id: "uuid-1", slug: "" })).toBe("/designs/uuid-1");
  });
});
