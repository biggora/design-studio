/**
 * Affiliate link wrapping. The database always stores canonical marketplace
 * URLs; tracking is applied only at render/API time from config, so links can
 * be re-pointed (or turned off) without touching stored data.
 *
 * Redbubble: the Impact deep-link template pasted into the
 * `affiliate.redbubbleTemplate` studio row (e.g.
 * `https://shop.pxf.io/c/123/456/789?u={url}`) — only linking codes obtained
 * from the affiliate interface may be used, and only through this helper.
 * TeePublic: the in-platform referral id from `affiliate.teepublicReferralId`
 * appended as `ref_id`.
 *
 * Everything is a no-op while the config values are empty.
 */

/** Wraps a Redbubble destination URL in the Impact deep-link template. Returns
 * the destination unchanged when the template is unset, not an http(s) URL, or
 * missing the `{url}` placeholder. */
export function applyRedbubbleAffiliate(dest: string, template: string): string {
  if (!dest || !template) return dest;

  try {
    const parsed = new URL(template);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return dest;
  } catch {
    return dest;
  }

  if (!template.includes("{url}")) return dest;
  // Replacer function so `$` sequences in the encoded destination can never be
  // interpreted as replacement patterns.
  return template.replace("{url}", () => encodeURIComponent(dest));
}

/** Appends the TeePublic referral id to a teepublic.com design link as
 * `ref_id`, replacing any existing value. No-op when the referral id is unset
 * or the link is missing/invalid. */
export function applyTeepublicReferral(link: string | null, refId: string): string | null {
  if (!link || !refId) return link;

  try {
    const parsed = new URL(link);
    parsed.searchParams.set("ref_id", refId);
    return parsed.toString();
  } catch {
    return link;
  }
}

/** Affiliate options extracted from a SiteConfig for consumers that only need
 * this slice (e.g. the public API routes). */
export type AffiliateOptions = {
  redbubbleTemplate?: string;
  teepublicReferralId?: string;
};

export function getAffiliateOptions(config: {
  affiliate?: { [key: string]: string };
}): AffiliateOptions {
  return {
    redbubbleTemplate: config.affiliate?.redbubbleTemplate || "",
    teepublicReferralId: config.affiliate?.teepublicReferralId || "",
  };
}
