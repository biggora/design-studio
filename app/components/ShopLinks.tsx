"use client";

type ShopLinksProps = {
  title: string;
  redBubble?: string;
  teePublic?: string;
  tostaDora?: string;
  styleTitle?: string;
};

// Redbubble/TeePublic links may be affiliate links (sponsored), Tostadora has
// no affiliate program — plain link.
const marketplaceLinks = [
  { key: "redbubble", label: "Buy on Redbubble", href: undefined as string | undefined, sponsored: true },
  { key: "teePublic", label: "Buy on TeePublic", href: undefined as string | undefined, sponsored: true },
  { key: "tostaDora", label: "Buy on Tostadora", href: undefined as string | undefined, sponsored: false },
] as const;

export default function ShopLinks({
  title,
  redBubble,
  teePublic,
  tostaDora,
  styleTitle = "text-2xl mb-4",
}: ShopLinksProps) {
  const links = { redbubble: redBubble, teePublic, tostaDora };
  const configured = marketplaceLinks.filter((m) => links[m.key]);

  if (configured.length === 0) return null;

  return (
    <>
      {title.trim() && (
        <h2 className={`${styleTitle} font-semibold text-foreground`}>{title}</h2>
      )}
      <div className="flex flex-wrap justify-start gap-3">
        {configured.map(({ key, label, sponsored }) => (
          <a
            key={key}
            href={links[key]}
            target="_blank"
            rel={sponsored ? "sponsored noopener noreferrer" : "noopener noreferrer"}
            className="inline-flex items-center gap-2 rounded-md border border-input px-4 py-2 text-base text-accent transition-colors hover:border-accent hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {label}
            <span aria-hidden="true">&#8599;</span>
          </a>
        ))}
      </div>
    </>
  );
}
