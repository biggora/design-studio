import {AccentLink} from "@/app/components/AccentLink";
import {SectionHeading} from "@/app/components/SectionHeading";
import type {DesignLinkSection} from "@/lib/design-pages";
import type {ResolvedDesignLink} from "@/lib/design-links";

export function CuratedDesignLinks({section, links}: {section?: DesignLinkSection; links: ResolvedDesignLink[]}) {
    if (!section || !links.length) return null;
    return (
        <section className="my-8 max-w-3xl">
            <SectionHeading>{section.heading}</SectionHeading>
            {section.intro && <p className="text-muted-foreground mb-3">{section.intro}</p>}
            <ul className="list-disc pl-5 space-y-2">
                {links.map(link => <li key={link.href}><AccentLink href={link.href}>{link.label}</AccentLink></li>)}
            </ul>
        </section>
    );
}
