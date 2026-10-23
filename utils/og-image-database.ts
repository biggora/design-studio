import type mysql from "mysql2/promise";
import { applyOgWrite, normalizeOgImage } from "@/lib/og-image";
import type { OgWrite, OgWriteResult } from "@/lib/og-image";

export async function setOgImageMySQL(
  pool: mysql.Pool,
  write: OgWrite,
): Promise<OgWriteResult> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.query<mysql.RowDataPacket[]>(
      "SELECT ogImage FROM designs WHERE id = ? AND active = TRUE FOR UPDATE",
      [write.designId],
    );
    if (!rows.length) {
      await c.commit();
      return { status: "not_found", ogImage: null };
    }
    const stored = normalizeOgImage(rows[0].ogImage);
    if (rows[0].ogImage != null && !stored) {
      throw new Error("Invalid saved Og assignment; refusing replacement");
    }
    const result = applyOgWrite(stored, write);
    if (result.status === "created" || result.status === "ready")
      await c.query("UPDATE designs SET ogImage = ? WHERE id = ?", [
        JSON.stringify(result.ogImage),
        write.designId,
      ]);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    c.release();
  }
}
