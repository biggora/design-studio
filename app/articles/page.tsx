import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { fetchPublishedArticles, getSiteConfig } from "@/utils/database";
import { PageShell } from "@/app/components/PageShell";
import { PageHeader } from "@/app/components/PageHeader";
import { CardGrid } from "@/app/components/CardGrid";
import { AccentLink } from "@/app/components/AccentLink";
import { buttonVariants } from "@/components/ui/button";
import { cn, focusRingClasses } from "@/lib/utils";

type Props = { searchParams: Promise<{ page?: string }> };
const pageNumber = (value?: string) =>
  value && /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value))
    ? Number(value)
    : 1;
const pageUrl = (page: number) =>
  page === 1 ? "/articles" : `/articles?page=${page}`;

export async function generateMetadata({
  searchParams,
}: Props): Promise<Metadata> {
  const [config, articles, params] = await Promise.all([
    getSiteConfig(),
    fetchPublishedArticles(),
    searchParams,
  ]);
  const page = pageNumber(params.page);
  return {
    title: `Articles${page > 1 ? ` — Page ${page}` : ""} | ${config.name}`,
    description:
      "Practical guides to caring for your clothes, looking after your prints, and making everyday fixes. Read the full articles on Tumblr.",
    alternates: { canonical: `https://${config.domain}${pageUrl(page)}` },
    robots: {
      index: articles.length > 0 && page <= Math.ceil(articles.length / 12),
      follow: true,
    },
  };
}

export default async function ArticlesPage({ searchParams }: Props) {
  const [articles, params] = await Promise.all([
    fetchPublishedArticles(),
    searchParams,
  ]);
  const page = pageNumber(params.page);
  const totalPages = Math.ceil(articles.length / 12);
  if (page > Math.max(1, totalPages)) notFound();
  const visible = articles.slice((page - 1) * 12, page * 12);
  return (
    <PageShell>
      <PageHeader
        title="Articles"
        intro="Care for your clothes. Make the prints last. Find practical guides and everyday fixes, with the full stories on Tumblr."
      />
      {visible.length ? (
        <CardGrid as="ul" columns={3}>
          {visible.map((article, index) => (
            <li key={`${article.url}:${article.sourceArticleId}`}>
              <article className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-surface">
                <Image
                  src={article.imageUrl}
                  alt={article.imageAlt || article.title}
                  width={1200}
                  height={630}
                  loading={index < 3 ? "eager" : "lazy"}
                  unoptimized
                  className="h-auto w-full"
                />
                <div className="flex flex-1 flex-col gap-3 p-5 sm:p-6">
                  <time
                    dateTime={article.publishedAt}
                    className="text-sm text-muted-foreground"
                  >
                    {new Intl.DateTimeFormat("en", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      timeZone: "UTC",
                    }).format(new Date(article.publishedAt))}
                  </time>
                  <h2 className="font-display text-xl font-semibold leading-snug text-balance">
                    <a
                      href={article.url}
                      className={cn(
                        "rounded-sm transition-colors hover:text-accent",
                        focusRingClasses,
                      )}
                    >
                      {article.title}
                    </a>
                  </h2>
                  <p className="whitespace-pre-line text-muted-foreground">
                    {article.excerpt}
                  </p>
                  <a
                    href={article.url}
                    className={cn(
                      "mt-auto pt-3 text-accent underline-offset-4 hover:underline",
                      focusRingClasses,
                    )}
                    aria-label={`Read on Tumblr: ${article.title}`}
                  >
                    Read on Tumblr
                  </a>
                </div>
              </article>
            </li>
          ))}
        </CardGrid>
      ) : (
        <p className="text-muted-foreground">
          Our articles are coming soon. In the meantime,{" "}
          <AccentLink href="/designs">explore our prints</AccentLink>.
        </p>
      )}
      {totalPages > 1 && (
        <nav
          aria-label="Article pages"
          className="mt-8 flex items-center justify-center gap-4"
        >
          {page > 1 && (
            <Link
              href={pageUrl(page - 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Previous
            </Link>
          )}
          <span>
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <Link
              href={pageUrl(page + 1)}
              className={buttonVariants({ variant: "outline", size: "sm" })}
            >
              Next
            </Link>
          )}
        </nav>
      )}
    </PageShell>
  );
}
