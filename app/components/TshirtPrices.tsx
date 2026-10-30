import type { Design } from "@/types/design";
import type { SiteConfig } from "@/lib/store";
import type { TshirtOffer } from "@/lib/marketplace-prices";
import { ArrowUpRight } from "lucide-react";
import { applyRedbubbleAffiliate, applyTeepublicReferral } from "@/lib/affiliate";
import { focusRingClasses, cn } from "@/lib/utils";
import BuyLink from "./BuyLink";
import { DesignImage } from "./DesignImage";

export function TshirtPrices({ offers, design, config }: {
  offers: TshirtOffer[];
  design: Design;
  config: SiteConfig;
}) {
  const primary = offers[0];
  if (!primary) return null;
  return (
    <section aria-labelledby="tshirt-prices-heading" className="my-6 border-t border-border pt-5">
      <h2 id="tshirt-prices-heading" className="font-display text-lg font-semibold">T-Shirt prices</h2>
      <div className="mt-3 flex items-center gap-3">
        {primary.image && (
          <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-md">
            <DesignImage design={design} src={primary.image} alt={primary.name} width={80} height={80} className="h-full w-full object-contain" />
          </div>
        )}
        <p className="text-sm text-muted-foreground">{primary.name}</p>
      </div>
      <ul className="mt-3 divide-y divide-border">
        {offers.map(offer => {
          const price = `${new Intl.NumberFormat("en", { style: "currency", currency: offer.currency }).format(Number(offer.price))} ${offer.currency}`;
          const href = offer.platform === "redbubble"
            ? applyRedbubbleAffiliate(offer.url, config.affiliate?.redbubbleTemplate || "")
            : offer.platform === "teepublic"
              ? applyTeepublicReferral(offer.url, config.affiliate?.teepublicReferralId || "") || offer.url
              : offer.url;
          const content = <>
            <span className="flex items-center gap-1">{offer.seller}{offer.platform !== "redbubble" && <ArrowUpRight className="h-4 w-4" aria-hidden="true" />}{offer.availability === "https://schema.org/OutOfStock" || offer.availability === "https://schema.org/SoldOut" ? " · Out of stock" : ""}</span>
            <span className="shrink-0 text-right">
              <span className="font-semibold tabular-nums">{price}</span>
              {offer.priceStatus === 'verified' && offer.salePrice && offer.regularPrice && <del className="ml-2 text-xs text-muted-foreground">{new Intl.NumberFormat('en', {style:'currency',currency:offer.currency}).format(Number(offer.regularPrice))}</del>}
              {offer.priceStatus === 'verified' && offer.salePrice && offer.saleEndsAt && <span className="block text-xs text-muted-foreground">Sale until {new Intl.DateTimeFormat('en',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'}).format(new Date(offer.saleEndsAt))} UTC</span>}
              {(offer.priceStatus === 'regular' || offer.priceStatus === 'last-checked') && <span className="block text-xs text-muted-foreground">{offer.priceStatus === 'regular' ? 'Regular price; check store' : 'Last checked price'} · {new Intl.DateTimeFormat('en',{dateStyle:'medium',timeZone:'UTC'}).format(new Date(offer.checkedAt))}</span>}
            </span>
          </>;
          return (
            <li key={offer.platform}>
              {offer.platform === "redbubble" ? (
                <div className="flex min-h-11 items-center justify-between gap-4 py-3">{content}</div>
              ) : <BuyLink href={href} platform={offer.platform} designSlug={design.slug || design.id} pageType="design" position="secondary"
                className={cn("flex min-h-11 items-center justify-between gap-4 rounded-sm py-3 text-accent hover:underline", focusRingClasses)}>
                {content}
              </BuyLink>}
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Checked {new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" }).format(new Date(primary.checkedAt))} UTC.
        {" "}Each store&apos;s currency is shown. Size, colour, tax and shipping may change the total.
        {" "}We may earn a commission from these links.
      </p>
    </section>
  );
}
