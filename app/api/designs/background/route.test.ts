import { describe, it, expect, beforeEach, vi } from "vitest";

const setDesignBackgroundsMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("@/lib/background-service", () => ({
  setDesignBackgrounds: setDesignBackgroundsMock,
}));

vi.mock("next/cache", () => ({
  revalidatePath: revalidatePathMock,
}));

function postRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://example.com/api/designs/background", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/designs/background", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("SYNC_SECRET", "correct-secret");
    setDesignBackgroundsMock.mockReset();
    revalidatePathMock.mockReset();
  });

  it("returns 401 when the secret is wrong", async () => {
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest(
      { color: "auto", all: true },
      { "x-sync-secret": "wrong-secret" },
    );
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(setDesignBackgroundsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid color", async () => {
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest(
      { color: "not-a-color", all: true },
      { "x-sync-secret": "correct-secret" },
    );
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(setDesignBackgroundsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when neither ids nor all is provided", async () => {
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest({ color: "auto" }, { "x-sync-secret": "correct-secret" });
    const response = await POST(request);
    expect(response.status).toBe(400);
    expect(setDesignBackgroundsMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON body", async () => {
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest("not json", { "x-sync-secret": "correct-secret" });
    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("returns 200 with the service result and revalidates on a non-dry update", async () => {
    setDesignBackgroundsMock.mockResolvedValue({
      color: "auto",
      dryRun: false,
      updated: [{ id: "d1", externalImageUrl: "https://x/raf,...jpg", backgroundColor: "#fafafa" }],
      skipped: [],
    });
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest(
      { color: "auto", all: true },
      { "x-sync-secret": "correct-secret" },
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      color: "auto",
      dryRun: false,
      updated: [{ id: "d1", externalImageUrl: "https://x/raf,...jpg", backgroundColor: "#fafafa" }],
      skipped: [],
    });
    expect(revalidatePathMock).toHaveBeenCalledWith("/", "layout");
  });

  it("does not revalidate on a dry run", async () => {
    setDesignBackgroundsMock.mockResolvedValue({
      color: "auto",
      dryRun: true,
      updated: [{ id: "d1", externalImageUrl: "https://x/raf,...jpg", backgroundColor: "#fafafa" }],
      skipped: [],
    });
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest(
      { color: "auto", all: true, dryRun: true },
      { "x-sync-secret": "correct-secret" },
    );
    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("returns 500 without leaking error details when the service throws", async () => {
    setDesignBackgroundsMock.mockRejectedValue(new Error("db exploded"));
    const { POST } = await import("@/app/api/designs/background/route");
    const request = postRequest(
      { color: "auto", all: true },
      { "x-sync-secret": "correct-secret" },
    );
    const response = await POST(request);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error" });
  });
});
