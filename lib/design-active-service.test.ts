import { describe, it, expect, beforeEach, vi } from "vitest";

const getDesignActiveStateMock = vi.fn();
const fetchDesignActiveEntriesMock = vi.fn();
const updateDesignActiveMock = vi.fn();

vi.mock("@/utils/database", () => ({
  getDesignActiveState: getDesignActiveStateMock,
  fetchDesignActiveEntries: fetchDesignActiveEntriesMock,
  updateDesignActive: updateDesignActiveMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setDesignActive", () => {
  it("throws when neither ids nor all is given", async () => {
    const { setDesignActive } = await import("@/lib/design-active-service");
    await expect(setDesignActive({ active: false })).rejects.toThrow(/Exactly one/);
  });

  it("throws when both ids and all are given", async () => {
    const { setDesignActive } = await import("@/lib/design-active-service");
    await expect(setDesignActive({ active: false, ids: ["d1"], all: true })).rejects.toThrow(/Exactly one/);
  });

  it("throws when ids exceeds the maximum of 500", async () => {
    const { setDesignActive } = await import("@/lib/design-active-service");
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    await expect(setDesignActive({ active: false, ids })).rejects.toThrow(/exceeds the maximum/);
  });

  describe("ids mode", () => {
    it("skips an id that doesn't resolve to a design", async () => {
      getDesignActiveStateMock.mockResolvedValueOnce(null);
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: false, ids: ["missing-1"] });

      expect(result.skipped).toEqual([{ id: "missing-1", reason: "not_found" }]);
      expect(result.updated).toHaveLength(0);
      expect(updateDesignActiveMock).not.toHaveBeenCalled();
    });

    it("skips a design whose flag already matches", async () => {
      getDesignActiveStateMock.mockResolvedValueOnce({ id: "d-active", title: "T", active: true });
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: true, ids: ["d-active"] });

      expect(result.skipped).toEqual([{ id: "d-active", reason: "unchanged" }]);
      expect(updateDesignActiveMock).not.toHaveBeenCalled();
    });

    it("deactivates a design through the column-scoped write", async () => {
      getDesignActiveStateMock.mockResolvedValueOnce({ id: "d1", title: "Fox", active: true });
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: false, ids: ["d1"] });

      expect(result.updated).toEqual([{ id: "d1", title: "Fox" }]);
      expect(result.skipped).toHaveLength(0);
      expect(updateDesignActiveMock).toHaveBeenCalledWith("d1", false);
    });

    it("does not write in dry-run mode but still reports the planned update", async () => {
      getDesignActiveStateMock.mockResolvedValueOnce({ id: "d-dry", title: "Fox", active: true });
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: false, ids: ["d-dry"], dryRun: true });

      expect(result.dryRun).toBe(true);
      expect(result.updated).toEqual([{ id: "d-dry", title: "Fox" }]);
      expect(updateDesignActiveMock).not.toHaveBeenCalled();
    });
  });

  describe("all mode", () => {
    it("deactivates every changed entry and skips the already-inactive ones", async () => {
      fetchDesignActiveEntriesMock.mockResolvedValueOnce([
        { id: "a", title: "A", active: true },
        { id: "b", title: "B", active: false },
        { id: "c", title: "C", active: true },
      ]);
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: false, all: true });

      expect(result.updated.map((entry) => entry.id)).toEqual(["a", "c"]);
      expect(result.skipped).toEqual([{ id: "b", reason: "unchanged" }]);
      expect(updateDesignActiveMock).toHaveBeenCalledTimes(2);
    });

    it("reactivation reaches already-deactivated entries (the all-mode read is unfiltered)", async () => {
      fetchDesignActiveEntriesMock.mockResolvedValueOnce([{ id: "b", title: "B", active: false }]);
      const { setDesignActive } = await import("@/lib/design-active-service");

      const result = await setDesignActive({ active: true, all: true });

      expect(result.updated).toEqual([{ id: "b", title: "B" }]);
      expect(updateDesignActiveMock).toHaveBeenCalledWith("b", true);
    });
  });
});
