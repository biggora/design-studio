import { beforeEach, describe, expect, it, vi } from "vitest";

const revalidatePathMock = vi.fn();
vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));

import { revalidateCatalogPages } from "./catalog-revalidation";

beforeEach(() => revalidatePathMock.mockClear());

describe("revalidateCatalogPages", () => {
  it("revalidates the catalog-driven pages and the sitemap", () => {
    revalidateCatalogPages();
    expect(revalidatePathMock.mock.calls).toEqual([
      ["/"], ["/designs"], ["/collections"], ["/gifts"], ["/sitemap.xml"],
      ["/designs/[slug]", "page"], ["/gifts/[slug]", "page"], ["/p/[slug]", "page"],
    ]);
  });

  it("never invalidates the root layout, so config-only pages keep their cache", () => {
    revalidateCatalogPages();
    expect(revalidatePathMock.mock.calls.some(([, type]) => type === "layout")).toBe(false);
    for (const page of ["/about", "/services", "/contact", "/privacy-policy", "/terms-of-service", "/disclosure"]) {
      expect(revalidatePathMock).not.toHaveBeenCalledWith(page);
    }
  });
});
