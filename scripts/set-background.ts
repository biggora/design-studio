import "dotenv/config";
import { closeDatabaseConnections } from "../utils/database";
import { setDesignBackgrounds } from "../lib/background-service";

export type SetBackgroundArgs = {
  color: string;
  ids?: string[];
  all: boolean;
  dryRun: boolean;
};

function parseArgs(argv: string[]): SetBackgroundArgs {
  const colorFlag = argv.find((arg) => arg.startsWith("--color="));
  const idFlag = argv.find((arg) => arg.startsWith("--id="));
  const all = argv.includes("--all");
  const dryRun = argv.includes("--dry-run");

  if (!colorFlag) {
    throw new Error("Missing required --color=<auto|white|black|token>");
  }
  const color = colorFlag.slice("--color=".length).trim();

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

  return { color, ids, all, dryRun };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const result = await setDesignBackgrounds({
    color: args.color,
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
          color: result.color,
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
