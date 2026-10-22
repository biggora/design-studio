import mysql from "mysql2/promise";
import type { CdnImage, CdnImageItem, CdnImageLookup, CdnImageResult } from "@/lib/listings";
import { normalizeCdnImageMockups } from "@/lib/image";

/** The design a lookup resolves to and its stored mockup array (mysql2 hands JSON back as text). */
export async function getDesignCdnImageMySQL(
  pool: mysql.Pool, lookup: CdnImageLookup,
): Promise<{ designId: string; cdnImage: CdnImage | null } | null> {
  const column = "sha256" in lookup ? "sha256" : "sourceImageId" in lookup ? "sourceImageId" : "externalId";
  const value = Object.values(lookup)[0];
  const [rows] = await pool.query<mysql.RowDataPacket[]>(`SELECT id, cdnImage FROM designs WHERE ${column} = ?`, [value]);
  if (!rows.length) return null;
  return { designId: rows[0].id, cdnImage: normalizeCdnImageMockups(rows[0].cdnImage) };
}

/**
 * MySQL twin of public.set_design_cdn_image (see init/migrations/008_design_cdn_image_api_postgres.sql):
 * one transaction, one result per item, per-item failures never abort the batch. Overwrites
 * designs.cdnImage, fills a NULL sha256 / sourceImageId from the item, bumps updatedAt, touches nothing else.
 */
export async function setDesignCdnImageMySQL(pool: mysql.Pool, items: CdnImageItem[]): Promise<CdnImageResult[]> {
  const connection = await pool.getConnection();
  const find = async (column: string, value: unknown): Promise<string | undefined> => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(`SELECT id FROM designs WHERE ${column} = ?`, [value]);
    return rows[0]?.id;
  };
  try {
    await connection.beginTransaction();
    const results: CdnImageResult[] = [];
    for (const [index, item] of items.entries()) {
      const found = new Set<string>();
      for (const [column, value] of [["sha256", item.sha256], ["sourceImageId", item.sourceImageId], ["externalId", item.redbubbleId]] as const) {
        const id = value === undefined ? undefined : await find(column, value);
        if (id) found.add(id);
      }
      if (found.size === 0) { results.push({ index, status: "not_found" }); continue; }
      if (found.size > 1) {
        results.push({ index, status: "conflict", message: "The identifiers resolve to different designs" });
        continue;
      }
      const [designId] = found;
      const [targetRows] = await connection.query<mysql.RowDataPacket[]>("SELECT id, sha256, sourceImageId FROM designs WHERE id = ? FOR UPDATE", [designId]);
      const target = targetRows[0];
      const expectedPrefix = (target.sha256 ?? item.sha256)?.slice(0, 16) as string | undefined;
      const conflict = (message: string) => results.push({ index, status: "conflict", designId, message });
      if (item.sha256 !== undefined && target.sha256 !== null && target.sha256 !== item.sha256) conflict("The design has a different sha256");
      else if (item.sourceImageId !== undefined && target.sourceImageId !== null && Number(target.sourceImageId) !== item.sourceImageId) {
        conflict("The design has a different sourceImageId");
      } else if (expectedPrefix && item.cdnImage.some(mockup => mockup.key.split("/")[1] !== expectedPrefix)) {
        conflict("The cdnImage keys do not address this design's sha256");
      } else {
        await connection.query(
          "UPDATE designs SET cdnImage = ?, sha256 = COALESCE(sha256, ?), sourceImageId = COALESCE(sourceImageId, ?), updatedAt = UTC_TIMESTAMP() WHERE id = ?",
          [JSON.stringify(item.cdnImage), item.sha256 ?? null, item.sourceImageId ?? null, designId],
        );
        results.push({ index, status: "updated", designId, cdnImage: item.cdnImage });
      }
    }
    await connection.commit();
    return results;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally { connection.release(); }
}
