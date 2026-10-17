import {config} from "dotenv";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {buildStudioRows, currentStudioValue, isChanged, SeoCopyPlan, summarizeRows, unknownCollections, validateSeoCopyPlan} from "@/lib/seo-copy";
import {closeDatabaseConnections, fetchFeedCollections, loadSiteConfig, saveStudioValue} from "@/utils/database";

config();

async function main() {
    const args = process.argv.slice(2);
    const planPath = args.find(arg => arg.startsWith("--plan="))?.slice(7);
    if (!planPath || args.some(arg => !arg.startsWith("--plan=") && arg !== "--apply" && arg !== "--dry-run")) {
        throw new Error("Usage: npx tsx scripts/apply-seo-copy.ts --plan=<json> [--dry-run|--apply]");
    }
    if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("Choose either --apply or --dry-run");
    const plan: SeoCopyPlan = JSON.parse(readFileSync(planPath, "utf8"));
    const known = new Set((await fetchFeedCollections()).map(collection => collection.title));
    validateSeoCopyPlan(plan);
    const warnings = {unknownCollections: unknownCollections(plan, known)};

    const rows = buildStudioRows(plan);
    const current = await loadSiteConfig();
    if (!args.includes("--apply")) {
        console.log(JSON.stringify({dryRun: true, rows: summarizeRows(rows, current), warnings}, null, 2));
        return;
    }
    const changed = rows.filter(row => isChanged(row, current));
    mkdirSync(".cache", {recursive: true});
    const backupPath = `.cache/seo-copy-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(backupPath, JSON.stringify({
        plan,
        previous: Object.fromEntries(rows.map(row => [row.key, currentStudioValue(current, row.key) ?? null])),
    }, null, 2));
    for (const row of changed) await saveStudioValue(row.key, row.value);
    console.log(JSON.stringify({applied: changed.map(row => row.key), backup: backupPath, warnings}, null, 2));
}

main().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(closeDatabaseConnections);
