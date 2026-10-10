import {config} from "dotenv";
import {mkdirSync, readFileSync, writeFileSync} from "node:fs";
import {getCollectionPages, curatedCollectionTitles, CollectionPage} from "@/lib/collections";
import {addCuratedCollections, closeDatabaseConnections, fetchFeedCollections, getDesignById, loadSiteConfig, saveCollectionPages} from "@/utils/database";

config();
type CurationPlan = {
    collectionPages: CollectionPage[];
    assignments: {id: string; title: string; collections: string[]}[];
};

async function main() {
    const args = process.argv.slice(2);
    const planPath = args.find(arg => arg.startsWith("--plan="))?.slice(7);
    if (!planPath || args.some(arg => !arg.startsWith("--plan=") && arg !== "--apply" && arg !== "--dry-run")) {
        throw new Error("Usage: npx tsx scripts/curate-collections.ts --plan=<reviewed.json> [--apply|--dry-run]");
    }
    if (args.includes("--apply") && args.includes("--dry-run")) throw new Error("Choose either --apply or --dry-run");
    const plan: CurationPlan = JSON.parse(readFileSync(planPath, "utf8"));
    if (!Array.isArray(plan.assignments) || !Array.isArray(plan.collectionPages)
        || getCollectionPages(plan.collectionPages).length !== plan.collectionPages.length) throw new Error("Invalid curation plan");
    const known = new Set((await fetchFeedCollections()).map(collection => collection.title));
    if (plan.collectionPages.some(page => !known.has(page.collection))) throw new Error("Unknown collection page");
    const before = [];
    for (const assignment of plan.assignments) {
        if (!Array.isArray(assignment.collections) || !assignment.collections.length || assignment.collections.some(title => !known.has(title))) {
            throw new Error(`Unknown or missing collection for ${assignment.title}`);
        }
        const result = await getDesignById(assignment.id);
        if (!result || result.design.title !== assignment.title) throw new Error(`Design changed or missing: ${assignment.title}`);
        before.push(result.design);
    }
    if (!args.includes("--apply")) {
        console.log(JSON.stringify({dryRun: true, reviewedDesigns: before.length, pages: plan.collectionPages.map(page => page.title)}, null, 2));
        return;
    }
    const previousPages = (await loadSiteConfig()).collectionPages;
    mkdirSync(".cache", {recursive: true});
    const backupPath = `.cache/collection-curation-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    writeFileSync(backupPath, JSON.stringify({plan, designs: before, previousPages: previousPages ?? null}, null, 2));
    for (const assignment of plan.assignments) await addCuratedCollections(assignment.id, assignment.collections);
    await saveCollectionPages(plan.collectionPages);
    for (const assignment of plan.assignments) {
        const current = await getDesignById(assignment.id);
        const saved = curatedCollectionTitles(current?.design.props);
        if (assignment.collections.some(title => !saved.includes(title))) throw new Error(`Curation verification failed: ${assignment.title}`);
    }
    console.log(JSON.stringify({applied: before.length, pages: plan.collectionPages.length, backup: backupPath}, null, 2));
}

main().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(closeDatabaseConnections);
