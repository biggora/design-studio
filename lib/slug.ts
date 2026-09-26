import { generateSlug } from "@/lib/utils";

// Matches a canonical UUID (case-insensitive) — used to detect a title that happens to be a
// UUID (or a slug that degenerated into one), which must never be used as a slug since it
// would be indistinguishable from the `/designs/<uuid>` fallback route.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A valid slug: lowercase alphanumeric segments joined by single hyphens, no leading/trailing
// hyphen, no empty segments.
export const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Leaves room for a "-N" collision suffix within the `VARCHAR(255)` column.
const MAX_SLUG_BASE_LENGTH = 200;

/**
 * Derives the base slug for a design from its title, before collision suffixing.
 * Falls back to `design-<externalId>` when the title slugifies to an empty string (e.g. a
 * non-Latin title with no ASCII characters) or happens to be UUID-shaped.
 */
export function designSlugBase(title: string, externalId: number | string): string {
  const base = generateSlug(title).slice(0, MAX_SLUG_BASE_LENGTH).replace(/-+$/, "");
  if (!base || UUID_PATTERN.test(base)) {
    return `design-${externalId}`;
  }
  return base;
}

/**
 * Returns the first of `base`, `base-2`, `base-3`, … not present in `taken`.
 */
export function uniqueSlug(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) {
    n += 1;
  }
  return `${base}-${n}`;
}

/**
 * Plans slug assignments for a backfill run. `rows` must be pre-sorted oldest first (stable
 * assignment order). Rows that already have a slug are left untouched but reserve their slug
 * so newly assigned slugs never collide with them; rows with a null slug are assigned one in
 * order, using the row's own title/externalId as the collision base.
 */
export function planSlugBackfill(
  rows: { id: string; externalId: number; title: string; slug: string | null }[],
): { id: string; slug: string }[] {
  const taken = new Set<string>();
  for (const row of rows) {
    if (row.slug) taken.add(row.slug);
  }

  const plan: { id: string; slug: string }[] = [];
  for (const row of rows) {
    if (row.slug) continue;
    const base = designSlugBase(row.title, row.externalId);
    const slug = uniqueSlug(base, taken);
    taken.add(slug);
    plan.push({ id: row.id, slug });
  }
  return plan;
}

/**
 * Public path for a design: its slug when set, falling back to its uuid `id` for designs
 * synced before slugs existed.
 */
export function designPath(design: { id: string; slug?: string | null }): string {
  return `/designs/${design.slug || design.id}`;
}
