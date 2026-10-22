import type mysql from "mysql2/promise";
import { applyPinWrite, normalizePinterestImage } from "@/lib/pinterest-image";
import type { PinWrite, PinWriteResult } from "@/lib/pinterest-image";

export async function setPinterestImageMySQL(
  pool: mysql.Pool,
  write: PinWrite,
): Promise<PinWriteResult> {
  const c = await pool.getConnection();
  try {
    await c.beginTransaction();
    const [rows] = await c.query<mysql.RowDataPacket[]>(
      "SELECT pinterestImage FROM designs WHERE id = ? AND active = TRUE FOR UPDATE",
      [write.designId],
    );
    if (!rows.length) {
      await c.commit();
      return { status: "not_found", pinterestImage: null };
    }
    const stored = normalizePinterestImage(rows[0].pinterestImage);
    if (rows[0].pinterestImage != null && !stored) {
      throw new Error("Invalid saved Pinterest assignment; refusing replacement");
    }
    const result = applyPinWrite(stored, write);
    if (result.status === "created" || result.status === "ready")
      await c.query("UPDATE designs SET pinterestImage = ? WHERE id = ?", [
        JSON.stringify(result.pinterestImage),
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
