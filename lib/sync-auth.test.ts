import { describe, it, expect, beforeEach, vi } from "vitest";

describe("lib/sync-auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it("returns 500 when SYNC_SECRET is not configured", async () => {
    vi.stubEnv("SYNC_SECRET", "");
    const { authorizeSyncRequest } = await import("@/lib/sync-auth");
    const request = new Request("https://example.com/api/sync", { method: "POST" });
    const result = authorizeSyncRequest(request);
    expect(result?.status).toBe(500);
    const body = await result?.json();
    expect(body).toEqual({ error: "SYNC_SECRET is not configured" });
  });

  it("returns 401 for a wrong secret", async () => {
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    const { authorizeSyncRequest } = await import("@/lib/sync-auth");
    const request = new Request("https://example.com/api/sync", {
      method: "POST",
      headers: { "x-sync-secret": "wrong-secret" },
    });
    const result = authorizeSyncRequest(request);
    expect(result?.status).toBe(401);
    const body = await result?.json();
    expect(body).toEqual({ error: "Unauthorized" });
  });

  it("authorizes via the Authorization: Bearer header", async () => {
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    const { authorizeSyncRequest } = await import("@/lib/sync-auth");
    const request = new Request("https://example.com/api/sync", {
      method: "POST",
      headers: { authorization: "Bearer correct-secret" },
    });
    expect(authorizeSyncRequest(request)).toBeNull();
  });

  it("authorizes via the x-sync-secret header", async () => {
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    const { authorizeSyncRequest } = await import("@/lib/sync-auth");
    const request = new Request("https://example.com/api/sync", {
      method: "POST",
      headers: { "x-sync-secret": "correct-secret" },
    });
    expect(authorizeSyncRequest(request)).toBeNull();
  });

  it("returns 401 without throwing when the provided secret has a different length", async () => {
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    const { authorizeSyncRequest } = await import("@/lib/sync-auth");
    const request = new Request("https://example.com/api/sync", {
      method: "POST",
      headers: { "x-sync-secret": "short" },
    });
    expect(() => authorizeSyncRequest(request)).not.toThrow();
    const result = authorizeSyncRequest(request);
    expect(result?.status).toBe(401);
  });
});
