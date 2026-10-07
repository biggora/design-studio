import mysql from "mysql2/promise";
import { randomUUID } from "node:crypto";
import { designSlugBase, uniqueSlug } from "@/lib/slug";
import {
  DesignListing, IngestDesign, IngestInput, IngestResult, ListingsError,
} from "@/lib/listings";

type DesignRow = IngestDesign & {
  source: string | null;
  description: string | null;
  keywords: string | null;
  backgroundColor: string | null;
  externalLink: string | null;
  props: Record<string, unknown> | null;
};

export function ingestDesignResponse(row: IngestDesign): IngestDesign {
  return {
    id: row.id, slug: row.slug, title: row.title, externalId: row.externalId,
    sha256: row.sha256, sourceImageId: row.sourceImageId,
  };
}

export function mysqlListingResponse(row: mysql.RowDataPacket): DesignListing {
  return {
    id: row.id, platform: row.platform, account: row.account, externalId: row.externalId,
    url: row.url, title: row.title, tags: row.tags, thumbnailUrl: row.thumbnailUrl,
    publishedAt: row.publishedAt ? new Date(`${String(row.publishedAt).replace(" ", "T")}Z`).toISOString() : null,
    extra: row.extra,
  };
}

export async function ingestListingMySQL(pool: mysql.Pool, input: IngestInput): Promise<IngestResult> {
  const connection = await pool.getConnection();
  const { design: d, listing: l } = input;
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
    const [hashRow] = await query("SELECT * FROM designs WHERE sha256 = ? FOR UPDATE", [d.sha256]);
    const [sourceRow] = await query("SELECT * FROM designs WHERE sourceImageId = ? FOR UPDATE", [d.sourceImageId]);
    if (hashRow && sourceRow && hashRow.id !== sourceRow.id) {
      conflict("sha256 and sourceImageId identify different designs", { sha256DesignId: hashRow.id, sourceImageIdDesignId: sourceRow.id });
    }
    let target = (hashRow || sourceRow) as DesignRow | undefined;
    if (!target && l.platform === "redbubble") {
      [target] = await query("SELECT * FROM designs WHERE externalId = ? FOR UPDATE", [l.externalId]) as (mysql.RowDataPacket & DesignRow)[];
    } else if (!target && l.platform === "teepublic") {
      const rows = await query("SELECT * FROM designs WHERE JSON_UNQUOTE(JSON_EXTRACT(props, '$.teepublicId')) = ? FOR UPDATE", [l.externalId]);
      if (rows.length > 1) conflict("TeePublic legacy ID identifies multiple designs");
      target = rows[0] as DesignRow | undefined;
    }
    if (target && ((target.sha256 !== null && target.sha256 !== d.sha256) ||
        (target.sourceImageId !== null && target.sourceImageId !== d.sourceImageId))) {
      conflict("Existing design has a different source identity", { designId: target.id });
    }
    const newDesign = !target;
    if (!target) {
      const id = randomUUID();
      const base = designSlugBase(d.title, d.sourceImageId);
      const taken = await query("SELECT slug FROM designs WHERE slug LIKE ? FOR UPDATE", [`${base}%`]);
      const slug = uniqueSlug(base, new Set(taken.map(row => row.slug as string)));
      await connection.query(
        "INSERT INTO designs (id, title, slug, description, keywords, backgroundColor, source, sha256, sourceImageId, externalId) VALUES (?, ?, ?, ?, ?, ?, 'pod-studio', ?, ?, ?)",
        [id, d.title, slug, d.description ?? "", (d.tags ?? []).join(","), d.backgroundColor ?? "#FFFFFF", d.sha256, d.sourceImageId, l.platform === "redbubble" ? Number(l.externalId) : null],
      );
      [target] = await query("SELECT * FROM designs WHERE id = ?", [id]) as (mysql.RowDataPacket & DesignRow)[];
    }
    const design = target!;
    const [existing] = await query("SELECT * FROM design_listings WHERE platform = ? AND externalId = ? FOR UPDATE", [l.platform, l.externalId]);
    if (existing && existing.designId !== design.id) conflict("Listing belongs to another design", { designId: design.id, listingDesignId: existing.designId });
    const accounts = await query("SELECT id FROM design_listings WHERE designId = ? AND platform = ? AND account = ? AND externalId <> ? FOR UPDATE", [design.id, l.platform, l.account, l.externalId]);
    if (accounts.length) conflict("Account already has a different listing for this design");
    if (l.platform === "redbubble") {
      const owners = await query("SELECT id FROM designs WHERE externalId = ? AND id <> ? FOR UPDATE", [l.externalId, design.id]);
      if (owners.length) conflict("Redbubble work belongs to another legacy design");
    }
    const listingId = existing?.id as string | undefined ?? randomUUID();
    if (!existing) {
      await connection.query(
        "INSERT INTO design_listings (id, designId, platform, account, externalId, url, publishedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [listingId, design.id, l.platform, l.account, l.externalId, l.url, new Date(l.publishedAt ?? Date.now()).toISOString().slice(0, 23).replace("T", " ")],
      );
    }
    const fields = ["account = ?", "url = ?", "updatedAt = UTC_TIMESTAMP(3)"];
    const values: unknown[] = [l.account, l.url];
    for (const key of ["title", "description", "tags", "thumbnailUrl", "publishedAt", "extra"] as const) {
      const value = l[key];
      if (value === undefined) continue;
      fields.push(`\`${key}\` = ?`);
      values.push(key === "publishedAt" ? new Date(value as string).toISOString().slice(0, 23).replace("T", " ") : key === "tags" || key === "extra" ? JSON.stringify(value) : value);
    }
    await connection.query(`UPDATE design_listings SET ${fields.join(", ")} WHERE id = ?`, [...values, listingId]);
    const props = { ...design.props };
    if (l.platform === "redbubble" && l.extra?.mockupTshirt && !props.mockup_tshirt) props.mockup_tshirt = l.extra.mockupTshirt;
    if (l.platform === "teepublic") Object.assign(props, { teepublicLink: l.url, teepublicId: l.externalId });
    await connection.query(
      "UPDATE designs SET sha256 = COALESCE(sha256, ?), sourceImageId = COALESCE(sourceImageId, ?), source = COALESCE(source, 'pod-studio'), description = COALESCE(description, ?), keywords = COALESCE(keywords, ?), backgroundColor = COALESCE(backgroundColor, ?), externalId = COALESCE(externalId, ?), externalLink = ?, props = ?, updatedAt = UTC_TIMESTAMP() WHERE id = ?",
      [d.sha256, d.sourceImageId, d.description ?? null, d.tags?.join(",") ?? null, d.backgroundColor ?? null,
        l.platform === "redbubble" ? Number(l.externalId) : null,
        l.platform === "redbubble" ? `https://www.redbubble.com/shop/ap/${l.externalId}` : design.externalLink,
        JSON.stringify(props), design.id],
    );
    const [savedDesign] = await query("SELECT * FROM designs WHERE id = ?", [design.id]);
    const [savedListing] = await query("SELECT * FROM design_listings WHERE id = ?", [listingId]);
    await connection.commit();
    return {
      design: ingestDesignResponse(savedDesign as mysql.RowDataPacket & IngestDesign),
      listing: mysqlListingResponse(savedListing), created: { design: newDesign, listing: !existing },
    };
  } catch (error) {
    await connection.rollback();
    const dbError = error as { code?: string };
    if (dbError.code === "ER_DUP_ENTRY" || dbError.code === "ER_LOCK_DEADLOCK") conflict("Unique identity, title, or listing conflict; retry if another ingest is in progress");
    throw error;
  } finally { connection.release(); }
}
