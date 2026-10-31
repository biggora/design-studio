import { describe, it, expect, beforeEach, vi } from "vitest";

const authorizeSyncRequestMock = vi.fn();
const setDesignActiveMock = vi.fn();
const revalidatePathMock = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: (...args: unknown[]) => revalidatePathMock(...args) }));
vi.mock("@/lib/sync-auth", () => ({ authorizeSyncRequest: (...args: unknown[]) => authorizeSyncRequestMock(...args) }));
vi.mock("@/lib/design-active-service", () => ({ setDesignActive: (...args: unknown[]) => setDesignActiveMock(...args) }));

function postRequest(body: unknown): Request {
  return new Request("http://localhost/api/designs/active", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  authorizeSyncRequestMock.mockReturnValue(null);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/designs/active", () => {
  it("rejects unauthenticated requests", async () => {
    authorizeSyncRequestMock.mockReturnValue(new Response("denied", { status: 401 }));
    const { POST } = await import("./route");
    const response = await POST(postRequest({ active: false, all: true }));
    expect(response.status).toBe(401);
    expect(setDesignActiveMock).not.toHaveBeenCalled();
  });

  it("rejects a non-boolean active value", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest({ active: "false", all: true }));
    expect(response.status).toBe(400);
    expect(setDesignActiveMock).not.toHaveBeenCalled();
  });

  it("rejects invalid JSON bodies", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/designs/active", { method: "POST", body: "not-json" }));
    expect(response.status).toBe(400);
  });

  it.each([
    [{ active: false }],
    [{ active: false, ids: [], all: false }],
  ])("requires exactly one of ids/all: %j", async (body) => {
    const { POST } = await import("./route");
    const response = await POST(postRequest(body));
    expect(response.status).toBe(400);
  });

  it("treats an empty ids array as all mode (background-route semantics)", async () => {
    setDesignActiveMock.mockResolvedValueOnce({ active: false, dryRun: false, updated: [], skipped: [] });
    const { POST } = await import("./route");
    const response = await POST(postRequest({ active: false, ids: [], all: true }));
    expect(response.status).toBe(200);
    expect(setDesignActiveMock).toHaveBeenCalledWith({ active: false, ids: undefined, all: true, dryRun: false });
  });

  it("rejects non-string ids", async () => {
    const { POST } = await import("./route");
    const response = await POST(postRequest({ active: false, ids: [1, 2] }));
    expect(response.status).toBe(400);
  });

  it("deactivates ids and revalidates the layout on a real change", async () => {
    setDesignActiveMock.mockResolvedValueOnce({ active: false, dryRun: false, updated: [{ id: "d1", title: "T" }], skipped: [] });
    const { POST } = await import("./route");

    const response = await POST(postRequest({ active: false, ids: ["d1"] }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.updated).toHaveLength(1);
    expect(setDesignActiveMock).toHaveBeenCalledWith({ active: false, ids: ["d1"], all: false, dryRun: false });
    expect(revalidatePathMock).toHaveBeenCalledWith("/");
    expect(revalidatePathMock).not.toHaveBeenCalledWith("/", "layout");
  });

  it("does not revalidate in dry-run mode", async () => {
    setDesignActiveMock.mockResolvedValueOnce({ active: false, dryRun: true, updated: [{ id: "d1", title: "T" }], skipped: [] });
    const { POST } = await import("./route");

    const response = await POST(postRequest({ active: false, ids: ["d1"], dryRun: true }));

    expect(response.status).toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it("answers 500 when the service throws", async () => {
    setDesignActiveMock.mockRejectedValueOnce(new Error("db down"));
    const { POST } = await import("./route");

    const response = await POST(postRequest({ active: false, all: true }));

    expect(response.status).toBe(500);
  });
});
