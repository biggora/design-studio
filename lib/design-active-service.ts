import {fetchDesignActiveEntries, getDesignActiveState, updateDesignActive} from "@/utils/database";

export type SetDesignActiveOptions = {
  active: boolean;
  ids?: string[];
  all?: boolean;
  dryRun?: boolean;
};

export type SetDesignActiveResult = {
  active: boolean;
  dryRun: boolean;
  updated: { id: string; title: string }[];
  skipped: { id: string; reason: string }[];
};

// Ids are matched case-sensitively against the designs primary key, like the
// background service. Target reads bypass the public active filter on purpose:
// this is the tooling that manages the flag, including on deactivated designs.
export async function setDesignActive(opts: SetDesignActiveOptions): Promise<SetDesignActiveResult> {
  const hasIds = Array.isArray(opts.ids) && opts.ids.length > 0;
  if (hasIds === !!opts.all) {
    throw new Error("Exactly one of a non-empty ids list or all:true is required");
  }
  if (hasIds && opts.ids!.length > 500) {
    throw new Error("ids exceeds the maximum of 500");
  }

  const dryRun = !!opts.dryRun;
  const updated: { id: string; title: string }[] = [];
  const skipped: { id: string; reason: string }[] = [];

  if (opts.ids) {
    for (const id of opts.ids) {
      const state = await getDesignActiveState(id);
      if (!state) {
        skipped.push({ id, reason: "not_found" });
        continue;
      }
      if (state.active === opts.active) {
        skipped.push({ id, reason: "unchanged" });
        continue;
      }
      if (!dryRun) {
        await updateDesignActive(id, opts.active);
      }
      updated.push({ id, title: state.title });
    }
    return { active: opts.active, dryRun, updated, skipped };
  }

  for (const state of await fetchDesignActiveEntries()) {
    if (state.active === opts.active) {
      skipped.push({ id: state.id, reason: "unchanged" });
      continue;
    }
    if (!dryRun) {
      await updateDesignActive(state.id, opts.active);
    }
    updated.push({ id: state.id, title: state.title });
  }

  return { active: opts.active, dryRun, updated, skipped };
}
