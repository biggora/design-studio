import { describe, it, expect } from "vitest";
import { createAssignment } from "@pod/pinterest-renderer";
import { canonical, digest } from "@pod/pinterest-renderer/contract";
import {
  applyPinWrite,
  parsePinWrite,
  parsePinLookup,
  normalizePinterestImage,
} from "./pinterest-image";
import { designVersionHash, buildFeedItem } from "./pinterest-feed";
import type { Design } from "@/types/design";
const designId = "a0000000-0000-4000-8000-000000000001";
const make = () =>
  createAssignment({
    designId,
    title: "A real complete title",
    brand: "example.org",
    sources: [
      {
        role: "tee",
        url: "https://ih1.redbubble.net/image.123.4567/tee.jpg",
        sha256: "a".repeat(64),
        crop: { left: 0, top: 0, width: 750, height: 1000 },
      },
    ],
  });
describe("saved Pinterest assignments", () => {
  it("assigns once, keeps the full original value and rejects replacement", async () => {
    const assignment = await make(),
      first = applyPinWrite(null, {
        designId,
        operation: "assign",
        assignment,
      });
    expect(first.status).toBe("created");
    expect(
      applyPinWrite(first.pinterestImage, {
        designId,
        operation: "assign",
        assignment,
      }).status,
    ).toBe("unchanged");
    const { hash, ...body } = assignment;
    expect(hash).toHaveLength(64);
    const changed = {
      ...body,
      title: "Changed title",
      typography: { ...body.typography, lines: ["Changed title"] },
    };
    const replacement = { ...changed, hash: digest(canonical(changed)) };
    const conflict = applyPinWrite(first.pinterestImage, {
      designId,
      operation: "assign",
      assignment: replacement,
    });
    expect(conflict.status).toBe("conflict");
    expect(conflict.pinterestImage).toEqual(first.pinterestImage);
  });
  it("accepts an asset only for its assignment and ignores property order on repeat", async () => {
    const assignment = await make(),
      stored = { assignment, asset: null },
      asset = {
        key: `pinterest/${designId}/${assignment.hash}/pin.jpg`,
        sha256: "b".repeat(64),
        width: 1000 as const,
        height: 1500 as const,
        bytes: 100,
      };
    expect(
      applyPinWrite(stored, {
        designId,
        operation: "ready",
        assignmentHash: "c".repeat(64),
        asset,
      }).status,
    ).toBe("conflict");
    const ready = applyPinWrite(stored, {
      designId,
      operation: "ready",
      assignmentHash: assignment.hash,
      asset,
    });
    expect(ready.status).toBe("ready");
    expect(
      applyPinWrite(normalizePinterestImage(canonical(ready.pinterestImage)), {
        designId,
        operation: "ready",
        assignmentHash: assignment.hash,
        asset,
      }).status,
    ).toBe("unchanged");
  });
  it("rejects invalid hashes, unknown properties, mixed pagination and unsafe identifiers", async () => {
    const assignment = await make();
    expect(() =>
      parsePinWrite({
        designId,
        operation: "assign",
        assignment: { ...assignment, title: "Tampered" },
      }),
    ).toThrow();
    expect(() =>
      parsePinWrite({ designId, operation: "assign", assignment, other: true }),
    ).toThrow();
    expect(() => parsePinLookup(new URLSearchParams("id=abc"))).toThrow();
    expect(() =>
      parsePinLookup(new URLSearchParams(`id=${designId}&page=1`)),
    ).toThrow();
    expect(() =>
      parsePinLookup(new URLSearchParams("sourceImageId=9007199254740993")),
    ).toThrow();
  });
  it("keeps the assigned feed URL stable when unrelated timestamps change, with one image and a stable GUID", async () => {
    const assignment = await make();
    const design = {
      id: designId,
      slug: "real-print",
      title: assignment.title,
      description: "Description",
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      pinterestImage: { assignment, asset: null },
    } as Design;
    const updated = { ...design, updatedAt: "2026-10-22" };
    expect(designVersionHash(design)).toBe(designVersionHash(updated));
    const before = buildFeedItem("example.org", { design }),
      after = buildFeedItem("example.org", { design: updated });
    expect(after).toBe(before);
    expect(after.match(/<media:content /g)).toHaveLength(1);
  });
});
