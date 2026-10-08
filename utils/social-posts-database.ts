import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { ListingsError } from "@/lib/listings";
import {
  SocialPost, SocialPostFilters, SocialPostIngestInput, SocialPostIngestResult, SocialPostList,
  SocialSummaryFilters, SocialSummaryRow,
} from "@/lib/social-posts";

const sqlTime = (iso: string) => new Date(iso).toISOString().slice(0, 23).replace("T", " ");
const isoTime = (value: unknown) => new Date(`${String(value).replace(" ", "T")}Z`).toISOString();

export function mysqlSocialPostResponse(row: mysql.RowDataPacket): SocialPost {
  return {
    id: row.id, designId: row.designId, channel: row.channel, account: row.account, variant: row.variant,
    externalId: row.externalId, url: row.url, linkUrl: row.linkUrl ?? null, title: row.title ?? null,
    caption: row.caption ?? null, hashtags: row.hashtags ?? null, imageUrl: row.imageUrl ?? null,
    board: row.board ?? null, status: row.status, publishedAt: isoTime(row.publishedAt),
    removedAt: row.removedAt ? isoTime(row.removedAt) : null, extra: row.extra ?? null,
    createdAt: isoTime(row.createdAt), updatedAt: isoTime(row.updatedAt),
  };
}

export async function upsertSocialPostMySQL(pool: mysql.Pool, input: SocialPostIngestInput): Promise<SocialPostIngestResult> {
  const connection = await pool.getConnection();
  const { design: d, post: p } = input;
  const query = async (sql: string, values: unknown[] = []) => {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(sql, values);
    return rows;
  };
  const conflict = (message: string, details?: unknown): never => {
    throw new ListingsError(409, "CONFLICT", message, undefined, details);
  };
  try {
    await connection.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
    await connection.beginTransaction();
    const [hashRow] = d.sha256 ? await query("SELECT * FROM designs WHERE sha256 = ? FOR UPDATE", [d.sha256]) : [];
    const [sourceRow] = d.sourceImageId !== undefined ? await query("SELECT * FROM designs WHERE sourceImageId = ? FOR UPDATE", [d.sourceImageId]) : [];
    if (hashRow && sourceRow && hashRow.id !== sourceRow.id) {
      conflict("sha256 and sourceImageId identify different designs", { sha256DesignId: hashRow.id, sourceImageIdDesignId: sourceRow.id });
    }
    const design = hashRow ?? sourceRow;
    if (!design) throw new ListingsError(404, "NOT_FOUND", "Design not found", "design");
    const [existing] = await query("SELECT * FROM design_social_posts WHERE channel = ? AND externalId = ? FOR UPDATE", [p.channel, p.externalId]);
    if (existing && existing.designId !== design.id) conflict("Post belongs to another design", { designId: design.id, postDesignId: existing.designId });
    if (existing?.status === "removed" && p.status === "published") conflict("Removed post cannot be published again", { postId: existing.id });
    const slots = await query(
      "SELECT id FROM design_social_posts WHERE designId = ? AND channel = ? AND account = ? AND variant = ? AND externalId <> ? FOR UPDATE",
      [design.id, p.channel, p.account, p.variant, p.externalId]);
    if (slots.length) conflict("Account already has a different post for this design and variant");
    const postId = existing?.id as string | undefined ?? randomUUID();
    if (!existing) {
      await connection.query(
        "INSERT INTO design_social_posts (id, designId, channel, account, variant, externalId, url, status, publishedAt, removedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [postId, design.id, p.channel, p.account, p.variant, p.externalId, p.url, p.status, sqlTime(p.publishedAt), p.removedAt ? sqlTime(p.removedAt) : null]);
    }
    const fields = ["account = ?", "variant = ?", "url = ?", "status = ?", "`publishedAt` = ?", "updatedAt = UTC_TIMESTAMP(3)"];
    const values: unknown[] = [p.account, p.variant, p.url, p.status, sqlTime(p.publishedAt)];
    if (p.status === "published") fields.push("`removedAt` = NULL");
    for (const key of ["linkUrl", "title", "caption", "hashtags", "imageUrl", "board", "removedAt", "extra"] as const) {
      const value = p[key];
      if (value === undefined) continue;
      fields.push(`\`${key}\` = ?`);
      values.push(key === "removedAt" ? sqlTime(value as string) : key === "hashtags" || key === "extra" ? JSON.stringify(value) : value);
    }
    await connection.query(`UPDATE design_social_posts SET ${fields.join(", ")} WHERE id = ?`, [...values, postId]);
    const [saved] = await query("SELECT * FROM design_social_posts WHERE id = ?", [postId]);
    await connection.commit();
    return {
      design: { id: design.id, slug: design.slug ?? null, title: design.title, sha256: design.sha256 ?? null, sourceImageId: design.sourceImageId ?? null },
      post: mysqlSocialPostResponse(saved), created: !existing,
    };
  } catch (error) {
    await connection.rollback();
    const dbError = error as { code?: string };
    if (dbError.code === "ER_DUP_ENTRY" || dbError.code === "ER_LOCK_DEADLOCK") conflict("Unique post conflict; retry if another ingest is in progress");
    throw error;
  } finally { connection.release(); }
}

function rangeWhere(filters: SocialPostFilters | SocialSummaryFilters, where: string[], values: unknown[]) {
  if (filters.since) { where.push("p.`publishedAt` >= ?"); values.push(sqlTime(filters.since)); }
  if (filters.until) { where.push("p.`publishedAt` <= ?"); values.push(sqlTime(filters.until)); }
}

export async function listSocialPostsMySQL(pool: mysql.Pool, filters: SocialPostFilters): Promise<SocialPostList> {
  const where: string[] = [];
  const values: unknown[] = [];
  const empty: SocialPostList = { data: [], pagination: { page: filters.page, limit: filters.limit, total: 0 } };
  if (filters.sha256 || filters.sourceImageId !== undefined) {
    const [designs] = filters.sha256
      ? await pool.query<mysql.RowDataPacket[]>("SELECT id FROM designs WHERE sha256 = ?", [filters.sha256])
      : await pool.query<mysql.RowDataPacket[]>("SELECT id FROM designs WHERE sourceImageId = ?", [filters.sourceImageId]);
    if (!designs.length) return empty;
    where.push("p.designId = ?");
    values.push(designs[0].id);
  }
  for (const key of ["channel", "account", "status"] as const) {
    if (filters[key]) { where.push(`p.\`${key}\` = ?`); values.push(filters[key]); }
  }
  rangeWhere(filters, where, values);
  if (filters.q) {
    const like = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(LOWER(p.title) LIKE LOWER(?) OR LOWER(p.caption) LIKE LOWER(?) OR LOWER(d.title) LIKE LOWER(?))");
    values.push(like, like, like);
  }
  const from = `FROM design_social_posts p JOIN designs d ON d.id = p.designId${where.length ? ` WHERE ${where.join(" AND ")}` : ""}`;
  const [[count]] = await pool.query<mysql.RowDataPacket[]>(`SELECT COUNT(*) AS total ${from}`, values);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT p.*, d.slug AS designSlug, d.title AS designTitle ${from} ORDER BY p.\`publishedAt\` DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...values, filters.limit, (filters.page - 1) * filters.limit]);
  return {
    data: rows.map(row => ({
      post: mysqlSocialPostResponse(row),
      design: { id: row.designId, slug: row.designSlug ?? null, title: row.designTitle },
    })),
    pagination: { page: filters.page, limit: filters.limit, total: Number(count.total) },
  };
}

export async function summarizeSocialPostsMySQL(pool: mysql.Pool, filters: SocialSummaryFilters): Promise<SocialSummaryRow[]> {
  const where: string[] = [];
  const values: unknown[] = [];
  rangeWhere(filters, where, values);
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `SELECT p.channel, p.account, p.status, COUNT(*) AS count FROM design_social_posts p${where.length ? ` WHERE ${where.join(" AND ")}` : ""} GROUP BY p.channel, p.account, p.status ORDER BY p.channel, p.account, p.status`,
    values);
  return rows.map(row => ({ channel: row.channel, account: row.account, status: row.status, count: Number(row.count) }));
}
