import { Design } from "@/types/design";
import { fetchDesigns, getDesignById, updateDesignBackground } from "@/utils/database";
import { applyBackground, isValidBackgroundValue, resolveBackgroundToken } from "@/lib/background";

export type SetDesignBackgroundsOptions = {
  color: string;
  ids?: string[];
  all?: boolean;
  dryRun?: boolean;
};

export type SetDesignBackgroundsResult = {
  color: string;
  dryRun: boolean;
  updated: { id: string; externalImageUrl: string; backgroundColor: string }[];
  skipped: { id: string; reason: string }[];
};

// Paging batch size for the `all` mode, reusing fetchDesigns' existing page/limit contract
// (no search/collection/keyword filter — every design is a candidate).
const PAGE_SIZE = 100;

async function loadTargetDesigns(opts: SetDesignBackgroundsOptions): Promise<{
  designs: Design[];
  skipped: { id: string; reason: string }[];
}> {
  const skipped: { id: string; reason: string }[] = [];

  if (opts.ids) {
    const designs: Design[] = [];
    for (const id of opts.ids) {
      const result = await getDesignById(id);
      if (!result) {
        skipped.push({ id, reason: "not_found" });
        continue;
      }
      designs.push(result.design);
    }
    return { designs, skipped };
  }

  const designs: Design[] = [];
  let page = 1;
  for (;;) {
    const { designs: pageDesigns, total } = await fetchDesigns(page, "", "", PAGE_SIZE, []);
    designs.push(...pageDesigns);
    if (designs.length >= total || pageDesigns.length === 0) break;
    page += 1;
  }
  return { designs, skipped };
}

export async function setDesignBackgrounds(
  opts: SetDesignBackgroundsOptions,
): Promise<SetDesignBackgroundsResult> {
  if (!isValidBackgroundValue(opts.color)) {
    throw new Error(`Invalid color "${opts.color}": expected "auto", a preset name, or a color token`);
  }

  const hasIds = Array.isArray(opts.ids) && opts.ids.length > 0;
  if (hasIds === !!opts.all) {
    throw new Error("Exactly one of a non-empty ids list or all:true is required");
  }
  if (hasIds && opts.ids!.length > 500) {
    throw new Error("ids exceeds the maximum of 500");
  }

  const dryRun = !!opts.dryRun;
  const { designs, skipped } = await loadTargetDesigns(opts);
  const updated: { id: string; externalImageUrl: string; backgroundColor: string }[] = [];

  for (const design of designs) {
    const applied = applyBackground(design, opts.color);
    if (!applied) {
      const reason = resolveBackgroundToken(opts.color, design) === null ? "no_token" : "not_redbubble_image";
      skipped.push({ id: design.id, reason });
      continue;
    }

    if (
      applied.externalImageUrl === design.externalImageUrl &&
      applied.backgroundColor === design.backgroundColor
    ) {
      skipped.push({ id: design.id, reason: "unchanged" });
      continue;
    }

    if (!dryRun) {
      await updateDesignBackground(design.id, applied.externalImageUrl, applied.backgroundColor);
    }
    updated.push({ id: design.id, externalImageUrl: applied.externalImageUrl, backgroundColor: applied.backgroundColor });
  }

  return { color: opts.color, dryRun, updated, skipped };
}
