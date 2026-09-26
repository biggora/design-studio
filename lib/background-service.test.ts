import { describe, it, expect, beforeEach, vi } from "vitest";
import { Design } from "@/types/design";

const fetchDesignsMock = vi.fn();
const getDesignByIdMock = vi.fn();
const updateDesignBackgroundMock = vi.fn();

vi.mock("@/utils/database", () => ({
  fetchDesigns: fetchDesignsMock,
  getDesignById: getDesignByIdMock,
  updateDesignBackground: updateDesignBackgroundMock,
}));

function makeDesign(overrides: Partial<Design> = {}): Design {
  return {
    id: "d1",
    externalId: 1,
    title: "Design",
    externalLink: "https://redbubble.com/i/d1",
    externalImageUrl: "https://ih1.redbubble.net/image.1.2/flat,500x,075,f.u2.jpg",
    category: "t-shirt",
    collection: "cats",
    imageName: "cat.jpg",
    description: "desc",
    keywords: "cat",
    backgroundColors: "",
    backgroundColor: "#FFFFFF",
    createdAt: "2024-01-01",
    updatedAt: "2024-01-02",
    props: {},
    ...overrides,
  };
}

const WHITE_URL = "https://ih1.redbubble.net/image.1.2/raf,750x,075,f,fafafa:ca443f4786.jpg";
const WHITE_HEX = "#fafafa";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("setDesignBackgrounds", () => {
  it("throws for an invalid color value", async () => {
    const { setDesignBackgrounds } = await import("@/lib/background-service");
    await expect(setDesignBackgrounds({ color: "purple", all: true })).rejects.toThrow(/Invalid color/);
  });

  it("throws when neither ids nor all is given", async () => {
    const { setDesignBackgrounds } = await import("@/lib/background-service");
    await expect(setDesignBackgrounds({ color: "white" })).rejects.toThrow(/Exactly one/);
  });

  it("throws when both ids and all are given", async () => {
    const { setDesignBackgrounds } = await import("@/lib/background-service");
    await expect(setDesignBackgrounds({ color: "white", ids: ["d1"], all: true })).rejects.toThrow(/Exactly one/);
  });

  it("throws when ids exceeds the maximum of 500", async () => {
    const { setDesignBackgrounds } = await import("@/lib/background-service");
    const ids = Array.from({ length: 501 }, (_, i) => `id-${i}`);
    await expect(setDesignBackgrounds({ color: "white", ids })).rejects.toThrow(/exceeds the maximum/);
  });

  describe("ids mode", () => {
    it("skips an id that doesn't resolve to a design", async () => {
      getDesignByIdMock.mockResolvedValueOnce(null);
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", ids: ["missing-1"] });

      expect(result.skipped).toEqual([{ id: "missing-1", reason: "not_found" }]);
      expect(result.updated).toHaveLength(0);
      expect(updateDesignBackgroundMock).not.toHaveBeenCalled();
    });

    it("skips a design with no mockup token when color is auto", async () => {
      const design = makeDesign({ id: "d-no-token", props: {} });
      getDesignByIdMock.mockResolvedValueOnce({ design, relatedDesigns: [] });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "auto", ids: ["d-no-token"] });

      expect(result.skipped).toEqual([{ id: "d-no-token", reason: "no_token" }]);
      expect(result.updated).toHaveLength(0);
      expect(updateDesignBackgroundMock).not.toHaveBeenCalled();
    });

    it("skips a design whose background already matches the requested color", async () => {
      const design = makeDesign({
        id: "d-unchanged",
        externalImageUrl: WHITE_URL,
        backgroundColor: WHITE_HEX,
      });
      getDesignByIdMock.mockResolvedValueOnce({ design, relatedDesigns: [] });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", ids: ["d-unchanged"] });

      expect(result.skipped).toEqual([{ id: "d-unchanged", reason: "unchanged" }]);
      expect(updateDesignBackgroundMock).not.toHaveBeenCalled();
    });

    it("updates a design and calls updateDesignBackground with the resolved url/color", async () => {
      const design = makeDesign({ id: "d-update" });
      getDesignByIdMock.mockResolvedValueOnce({ design, relatedDesigns: [] });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", ids: ["d-update"] });

      expect(result.updated).toEqual([{ id: "d-update", externalImageUrl: WHITE_URL, backgroundColor: WHITE_HEX }]);
      expect(result.skipped).toHaveLength(0);
      expect(updateDesignBackgroundMock).toHaveBeenCalledWith("d-update", WHITE_URL, WHITE_HEX);
    });

    it("does not call updateDesignBackground in dry-run mode but still reports the planned update", async () => {
      const design = makeDesign({ id: "d-dry" });
      getDesignByIdMock.mockResolvedValueOnce({ design, relatedDesigns: [] });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", ids: ["d-dry"], dryRun: true });

      expect(result.updated).toEqual([{ id: "d-dry", externalImageUrl: WHITE_URL, backgroundColor: WHITE_HEX }]);
      expect(updateDesignBackgroundMock).not.toHaveBeenCalled();
    });
  });

  describe("all mode", () => {
    it("pages through fetchDesigns until every design has been fetched", async () => {
      const page1 = [makeDesign({ id: "a" }), makeDesign({ id: "b" })];
      const page2 = [makeDesign({ id: "c" })];
      fetchDesignsMock.mockResolvedValueOnce({ designs: page1, total: 3 });
      fetchDesignsMock.mockResolvedValueOnce({ designs: page2, total: 3 });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", all: true });

      expect(fetchDesignsMock).toHaveBeenCalledTimes(2);
      expect(fetchDesignsMock).toHaveBeenNthCalledWith(1, 1, "", "", 100, []);
      expect(fetchDesignsMock).toHaveBeenNthCalledWith(2, 2, "", "", 100, []);
      expect(result.updated).toHaveLength(3);
      expect(updateDesignBackgroundMock).toHaveBeenCalledTimes(3);
    });

    it("stops paging as soon as a page comes back empty", async () => {
      fetchDesignsMock.mockResolvedValueOnce({ designs: [], total: 3 });
      const { setDesignBackgrounds } = await import("@/lib/background-service");

      const result = await setDesignBackgrounds({ color: "white", all: true });

      expect(fetchDesignsMock).toHaveBeenCalledTimes(1);
      expect(result.updated).toHaveLength(0);
      expect(result.skipped).toHaveLength(0);
    });
  });
});
