import "dotenv/config";
import {mkdirSync, writeFileSync} from "node:fs";
import {GIFT_TOPICS, designGiftTopics, isGiftTopic} from "@/lib/gift-selection";
import {getGiftPages} from "@/lib/gifts";
import {closeDatabaseConnections, fetchGiftPageSections, getDesignById, loadSiteConfig, setDesignGiftTopics} from "@/utils/database";

async function main() {
    const args = process.argv.slice(2);
    const id = args.find(arg => arg.startsWith("--id="))?.slice(5);
    const topicsArg = args.find(arg => arg.startsWith("--topics="));
    const automatic = args.includes("--auto");
    if (args.some(arg => !["--auto", "--apply", "--dry-run", "--report"].includes(arg) && !arg.startsWith("--id=") && !arg.startsWith("--topics="))
        || (args.includes("--apply") && args.includes("--dry-run"))) throw new Error("Invalid arguments");
    if (args.includes("--report")) {
        if (args.length !== 1) throw new Error("--report does not accept write options");
        const config = await loadSiteConfig();
        const pages = [];
        for (const page of getGiftPages(config.giftPages)) pages.push({slug: page.slug,
            sections: (await fetchGiftPageSections(page, 100)).map(section => ({heading: section.heading,
                designs: section.designs.map(design => ({id: design.id, title: design.title, topics: designGiftTopics(design)}))}))});
        console.log(JSON.stringify(pages, null, 2));
        return;
    }
    if (!id || (!!topicsArg === automatic)) throw new Error(`Usage: --report OR --id=<uuid> (--topics=<comma-separated|empty> | --auto) [--apply|--dry-run]. Topics: ${GIFT_TOPICS.join(", ")}`);
    const topics = automatic ? null : topicsArg!.slice(9).split(",").filter(Boolean);
    if (topics?.some(topic => !isGiftTopic(topic))) throw new Error("Unknown gift topic");
    const before = (await getDesignById(id, true))?.design;
    if (!before) throw new Error("Design not found");
    if (!args.includes("--apply")) {
        console.log(JSON.stringify({dryRun: true, id, title: before.title, before: before.giftTopics ?? null, giftTopics: topics}, null, 2));
        return;
    }
    mkdirSync(".cache", {recursive: true});
    writeFileSync(`.cache/gift-topics-${id}-${Date.now()}.json`, JSON.stringify({id, giftTopics: before.giftTopics ?? null}));
    const reviewed = topics === null ? null : topics.filter(isGiftTopic);
    await setDesignGiftTopics(id, reviewed);
    const after = (await getDesignById(id, true))?.design;
    if (JSON.stringify(after?.giftTopics) !== JSON.stringify(reviewed === null ? null : [...new Set(reviewed)])) throw new Error("Gift topics readback mismatch");
    console.log(JSON.stringify({id, title: after?.title, giftTopics: after?.giftTopics, applied: true}));
}

main().catch(error => {console.error(error.message); process.exitCode = 1;}).finally(closeDatabaseConnections);
