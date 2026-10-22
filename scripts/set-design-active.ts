import "dotenv/config";
import { closeDatabaseConnections } from "../utils/database";
import { setDesignActive } from "../lib/design-active-service";

export type SetActiveArgs = {
  active: boolean;
  ids?: string[];
  all: boolean;
  dryRun: boolean;
};

function parseActiveFlag(argv: string[]): boolean {
  const flag = argv.find((arg) => arg.startsWith("--active="));
  if (!flag) {
    throw new Error("Missing required --active=<true|false>");
  }
  const value = flag.slice("--active=".length).trim().toLowerCase();
  if (value !== "true" && value !== "false") {
    throw new Error(`Invalid --active value "${value}": expected true or false`);
  }
  return value === "true";
}

function parseArgs(argv: string[]): SetActiveArgs {
  const active = parseActiveFlag(argv);
  const idFlag = argv.find((arg) => arg.startsWith("--id="));
  const all = argv.includes("--all");
  const dryRun = argv.includes("--dry-run");

  const ids = idFlag
    ? idFlag
        .slice("--id=".length)
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean)
    : undefined;

  if ((ids && ids.length > 0) === all) {
    throw new Error("Pass exactly one of --id=<id>[,<id>...] or --all");
  }

  return { active, ids, all, dryRun };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const result = await setDesignActive({
    active: args.active,
    ids: args.ids,
    all: args.all,
    dryRun: args.dryRun,
  });

  console.log(JSON.stringify(result, null, 2));

  const skipCounts = result.skipped.reduce<Record<string, number>>((acc, s) => {
    acc[s.reason] = (acc[s.reason] || 0) + 1;
    return acc;
  }, {});

  console.log(
    JSON.stringify(
      {
        summary: {
          active: result.active,
          dryRun: result.dryRun,
          updated: result.updated.length,
          skipped: result.skipped.length,
          skippedByReason: skipCounts,
        },
      },
      null,
      2,
    ),
  );
}

async function main() {
  try {
    await run();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  } finally {
    await closeDatabaseConnections();
  }
}

main();
