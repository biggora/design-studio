import type {Design} from "@/types/design";
import type {GiftPage, GiftSection} from "@/lib/gifts";

// Subjects, not generic gift/holiday marketing language. Phrases match whole words.
const SUBJECTS = {
    halloween: ["halloween", "trick or treat", "jack o lantern", "spooky season"],
    "black-friday": ["black friday", "cyber monday"],
    thanksgiving: ["thanksgiving", "friendsgiving", "turkey trot", "thanksgiving run"],
    christmas: ["christmas", "xmas", "santa claus", "santa hat", "candy cane", "candy canes"],
    valentines: ["valentine", "valentines", "galentine", "galentines", "romantic", "romance", "couple", "couples", "my partner"],
    "mothers-day": ["mothers day", "mom", "moms", "mum", "mums", "mama", "motherhood", "best mother", "my mother", "grandma", "grandmas", "grandmother", "grandmothers", "granny", "nana", "mimi", "stepmom"],
    "fathers-day": ["fathers day", "dad", "dads", "daddy", "fatherhood", "best father", "my father", "grandpa", "grandpas", "grandfather", "grandfathers", "stepdad"],
    "back-to-school": ["back to school", "school day", "school days", "school life", "school year", "school humor", "school community", "schoolwork", "classroom", "teacher", "teachers", "student", "students", "homework", "hall pass"],
    developers: ["programmer", "programmers", "programming", "coding", "coder", "developer", "debugging", "software", "sysadmin", "devops", "pull request", "open source", "javascript", "typescript", "python programming", "python code", "markdown", "localhost", "git", "llm", "ai agent"],
    coworkers: ["coworker", "coworkers", "colleague", "colleagues", "office", "remote work", "work from home", "team meeting", "meetings", "workplace", "work life", "deadline", "deadlines", "project manager", "teamwork", "scrum", "standup"],
    "pet-lovers": ["cat", "cats", "kitten", "kittens", "dog", "dogs", "puppy", "puppies", "pet", "pets", "feline", "canine", "hamster", "guinea pig", "pet rabbit", "bunny", "parrot"],
    "gamers-and-geeks": ["gamer", "gamers", "gaming", "video game", "video games", "arcade", "tabletop", "rpg", "d20", "dungeon master", "board game", "chess", "go board", "respawn", "game controller", "geek", "nerd", "programmer", "coding", "localhost", "llm", "ai agent"],
    "food-lovers": ["food", "foodie", "cooking", "cook", "chef", "kitchen", "baking", "baker", "sourdough", "ramen", "pizza", "chili", "chilli", "coffee", "cookie", "cookies", "gingerbread", "casserole", "pasta", "sushi", "barbecue", "bbq", "plant based diet", "plant nutrition"],
    "family-and-friends": ["family", "families", "friend", "friends", "friendship", "cousin", "cousins", "mom", "mum", "dad", "grandma", "grandpa", "grandmother", "grandfather", "nana", "mimi", "parent", "parents", "sister", "brother", "couple", "couples", "my partner", "wife", "husband"],
    hobbyists: ["hobby", "hobbyist", "craft", "crafting", "crafter", "bead", "beads", "beading", "knitting", "crochet", "sewing", "candle making", "woodturning", "woodworking", "fencing", "cycling", "bicycle", "aquarium", "fishkeeper", "aquascaping", "mushroom grower", "mycology", "novel writing", "writer", "manuscript", "sketchbook", "ham radio", "model rocket", "puzzle", "puzzles", "climbing", "birding", "bird watching", "foraging", "hiking", "camper", "camping", "photographer", "photography", "filmmaker", "video editing", "keyframe", "raw files"],
    "self-care-and-wellness": ["self care", "self compassion", "mental health", "mindfulness", "mindful", "meditation", "yoga", "rest day", "rest and recover", "rest and relax", "slow living", "emotional support", "stress relief", "wellness", "its okay to not be okay", "be kind to your mind"],
} as const;

export type GiftTopic = keyof typeof SUBJECTS;
export const GIFT_TOPICS = Object.keys(SUBJECTS) as GiftTopic[];
export const isGiftTopic = (value: unknown): value is GiftTopic =>
    typeof value === "string" && Object.hasOwn(SUBJECTS, value);

/** Missing is automatic. Malformed stored overrides fail closed instead of broadening selection. */
export function normalizeGiftTopics(value: unknown): GiftTopic[] | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") {
        try {value = JSON.parse(value);} catch {return [];}
    }
    return Array.isArray(value) && value.every(isGiftTopic) ? [...new Set(value)] : [];
}

const PAGE_TOPICS: Record<string, GiftTopic> = {
    "halloween-gift-ideas": "halloween", "black-friday-gift-ideas": "black-friday",
    "thanksgiving-gift-ideas": "thanksgiving", "christmas-gift-ideas": "christmas",
    "valentines-day-gift-ideas": "valentines", "mothers-day-gift-ideas": "mothers-day",
    "fathers-day-gift-ideas": "fathers-day", "back-to-school-gift-ideas": "back-to-school",
    ...Object.fromEntries(GIFT_TOPICS.map(topic => [`gifts-for-${topic}`, topic])),
};

export function giftPageTopic(page: Pick<GiftPage, "slug" | "topic">): GiftTopic | undefined {
    return page.topic ?? (Object.hasOwn(PAGE_TOPICS, page.slug) ? PAGE_TOPICS[page.slug] : undefined);
}

const normalize = (value: string) => value.toLowerCase().normalize("NFKC")
    .replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const contains = (value: string, phrases: readonly string[]) => phrases.some(phrase => ` ${value} `.includes(` ${phrase} `));

// Strong holiday names override incidental cross-selling tags. Generic words such as
// ghost, pumpkin, love, turkey and holiday are deliberately insufficient by themselves.
const OCCASIONS = {
    halloween: SUBJECTS.halloween, "black-friday": SUBJECTS["black-friday"],
    thanksgiving: SUBJECTS.thanksgiving, christmas: ["christmas", "xmas"],
    valentines: ["valentine", "valentines", "galentine", "galentines"],
    "mothers-day": ["mothers day"], "fathers-day": ["fathers day"],
    "back-to-school": ["back to school"],
    // These occasions have no landing page yet, but must still prevent cross-holiday admission.
    easter: ["easter"], "new-year": ["new year", "new years"],
    hanukkah: ["hanukkah", "chanukah"], diwali: ["diwali"],
    eid: ["eid mubarak", "eid al fitr", "eid al adha"],
    "independence-day": ["independence day", "4th of july", "fourth of july"],
    "st-patricks-day": ["st patricks day", "saint patricks day"],
    birthday: ["birthday"], retirement: ["retirement", "retired"],
};

export function designGiftTopics(design: Pick<Design, "title" | "keywords" | "giftTopics" | "active">): GiftTopic[] {
    if (design.active === false) return [];
    const reviewed = normalizeGiftTopics(design.giftTopics);
    if (reviewed !== null) return reviewed;
    const title = normalize(design.title ?? "");
    const tags = (design.keywords ?? "").split(/[,;\n]/).map(normalize)
        .filter(tag => !/\b(gift|gifts|for him|for her|for friends)\b/.test(tag));
    const titleOccasions = Object.entries(OCCASIONS).filter(([, phrases]) => contains(title, phrases)).map(([topic]) => topic);
    return GIFT_TOPICS.filter(topic => {
        if (Object.hasOwn(OCCASIONS, topic) && titleOccasions.length && !titleOccasions.includes(topic)) return false;
        if (contains(title, SUBJECTS[topic])) return true;
        // Audience tags such as "programmer dad" or "cat mom" are cross-selling,
        // not enough evidence that the artwork celebrates a parent.
        if (topic === "mothers-day" || topic === "fathers-day") return tags.includes(topic === "mothers-day" ? "mothers day" : "fathers day");
        if (topic === "back-to-school") return tags.some(tag => contains(tag,
            ["back to school", "school life", "school humor", "school community", "classroom", "homework", "hall pass"]));
        return tags.some(tag => contains(tag, SUBJECTS[topic].filter(phrase =>
            phrase !== "coffee" || /^(?:coffee|coffee lover|coffee lovers|coffee humor|coffee art)$/.test(tag))));
    });
}

export function matchesGiftPage(design: Parameters<typeof designGiftTopics>[0], page: Pick<GiftPage, "slug" | "topic">): boolean {
    const topic = giftPageTopic(page);
    return !!topic && designGiftTopics(design).includes(topic);
}

export type GiftCandidate = Pick<Design, "id" | "title" | "keywords" | "giftTopics" | "active" | "collection" | "createdAt">;
export type GiftDesignSection<T = Design> = Omit<GiftSection, "collection"> & {collection?: string; designs: T[]};

/** Filter before limiting; put each print in its first matching section only. */
export function selectGiftSections<T extends GiftCandidate>(page: GiftPage, designs: T[], memberships: ReadonlyMap<string, string[]>, limit: number): GiftDesignSection<T>[] {
    const sections: GiftDesignSection<T>[] = page.sections.map(section => ({...section, designs: []}));
    const other: GiftDesignSection<T> = {heading: "More matching designs", designs: []};
    const seen = new Set<string>();
    for (const design of designs) {
        if (seen.has(design.id) || !matchesGiftPage(design, page)) continue;
        seen.add(design.id);
        const collections = new Set([design.collection, ...(memberships.get(design.id) ?? [])]);
        const section = sections.find(section => collections.has(section.collection!)) ?? other;
        if (section.designs.length < limit) section.designs.push(design);
    }
    return [...sections, other].filter(section => section.designs.length);
}
