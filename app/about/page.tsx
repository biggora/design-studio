import { SiteConfig, AboutConfig } from "@/lib/store";
import { getSiteConfig } from "@/utils/database";
import { Metadata, type ResolvingMetadata } from "next";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { SectionHeading } from "@/app/components/SectionHeading";

export async function generateMetadata(_props?: unknown, parent?: ResolvingMetadata): Promise<Metadata> {
  const inherited = await parent;
  const config: SiteConfig = await getSiteConfig();
  const title = `About ${config.name} - Our Story and Approach`;
  const description = `Learn about ${config.name}'s journey, our passionate team, and our approach to print-on-demand apparel design.`;
  return {
    title,
    description,
    keywords: `${config.name}, about us, design studio, print-on-demand, apparel design`,
    alternates: { canonical: "/about" },
    openGraph: {
      ...inherited?.openGraph,
      url: `https://${config.domain}/about`,
      type: "website",
      title,
      description,
    },
    twitter: {
      ...inherited?.twitter,
      title,
      description,
    },
  };
}

export default async function About() {
  const config: SiteConfig = await getSiteConfig();

  // Tolerate a partially configured `about` block: a malformed studio row
  // must degrade to a shorter page, never a 500.
  const about: Partial<AboutConfig> = config.about ?? {};
  const story = Array.isArray(about.story) ? about.story : [];
  const approachIntro =
    typeof about.approachIntro === "string" ? about.approachIntro : "";
  const approachPoints = Array.isArray(about.approachPoints)
    ? about.approachPoints
    : [];
  const approachOutro =
    typeof about.approachOutro === "string" ? about.approachOutro : "";

  const fill = (text: string) =>
    String(text ?? "").replaceAll("{{name}}", config.name);

  return (
    <PageShell className="pb-3">
      <PageHeader title={`About ${config.name}`} />

      {story.length > 0 && (
        <section className="mb-12">
          <SectionHeading>Our Story</SectionHeading>
          <div className="space-y-4">
            {story.map((paragraph, index) => (
              <p key={index} className="text-foreground max-w-prose">
                {fill(paragraph)}
              </p>
            ))}
          </div>
        </section>
      )}

      {(approachIntro || approachPoints.length > 0 || approachOutro) && (
        <section className="pb-3">
          <SectionHeading>Our Approach</SectionHeading>
          {approachIntro && (
            <p className="text-foreground mb-4 max-w-prose">
              {fill(approachIntro)}
            </p>
          )}
          {approachPoints.length > 0 && (
            <ul className="list-disc list-inside text-foreground mb-4 max-w-prose">
              {approachPoints.map((point, index) => (
                <li key={index}>{fill(point)}</li>
              ))}
            </ul>
          )}
          {approachOutro && (
            <p className="text-foreground pb-5 max-w-prose">
              {fill(approachOutro)}
            </p>
          )}
        </section>
      )}
    </PageShell>
  );
}
