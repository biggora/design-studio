import { Design } from "@/types/design";

// Redbubble's image CDN only fills transparent artwork areas with a *signed* color token —
// `raf,750x,075,f,<token>.jpg` — where `<token>` is `<hex6>[~<hex6>]:<hash10>` and the hash
// is verified server-side. An arbitrary hex with no matching hash is rejected (HTTP 400/500),
// so "pick any background color" is impossible; only known tokens (this artist's own Classic
// T-Shirt mockup color, or the two site-wide presets below) can be used.
export const BACKGROUND_PRESETS = {
  white: "fafafa:ca443f4786",
  black: "101010:01c5ca27c6",
} as const;

export const BACKGROUND_TOKEN_RE = /^[0-9a-f]{6}(?:~[0-9a-f]{6})?:[0-9a-f]{10}$/;

// Parses the signed color token out of a Classic T-Shirt mockup URL, e.g.
// ".../ssrco,classic_tee,flatlay,101010:01c5ca27c6,front,tall_portrait,x1000.jpg".
export function extractMockupToken(mockupUrl: string | null | undefined): string | null {
  if (!mockupUrl) return null;
  const match = mockupUrl.match(/ssrco,classic_tee,[a-z0-9_]+,([0-9a-f]{6}(?:~[0-9a-f]{6})?:[0-9a-f]{10}),/i);
  return match ? match[1].toLowerCase() : null;
}

export function isValidBackgroundValue(value: string): boolean {
  const normalized = value.toLowerCase();
  if (normalized === "auto") return true;
  // Object.hasOwn (not `in`, which also matches inherited keys like "constructor"/"__proto__")
  // — a value of "constructor" must never be treated as a known preset name.
  if (Object.hasOwn(BACKGROUND_PRESETS, normalized)) return true;
  return BACKGROUND_TOKEN_RE.test(normalized);
}

// Resolves a user-facing background value to a concrete signed token for this design.
// "auto" needs the design's own artist-chosen mockup token; presets are fixed known tokens;
// anything else is checked against the token format and used as-is.
export function resolveBackgroundToken(value: string, design: Pick<Design, "props">): string | null {
  const normalized = value.toLowerCase();
  if (normalized === "auto") {
    return extractMockupToken((design.props as { mockup_tshirt?: string } | undefined)?.mockup_tshirt);
  }
  if (Object.hasOwn(BACKGROUND_PRESETS, normalized)) {
    return BACKGROUND_PRESETS[normalized as keyof typeof BACKGROUND_PRESETS];
  }
  return BACKGROUND_TOKEN_RE.test(normalized) ? normalized : null;
}

// Same host/path match as buildArtworkImageUrl (lib/sync/redbubble.ts) — only rewrites known
// Redbubble image URLs; anything else is returned unchanged since raf,... is Redbubble-only.
const REDBUBBLE_IMAGE_URL_RE = /^(https:\/\/[a-z0-9.-]+\/image\.[^/]+)\//i;

export function buildBackgroundImageUrl(imageUrl: string, token: string): string {
  const match = imageUrl.match(REDBUBBLE_IMAGE_URL_RE);
  if (!match) return imageUrl;
  return `${match[1]}/raf,750x,075,f,${token}.jpg`;
}

export function tokenToHex(token: string): string {
  return `#${token.slice(0, 6)}`;
}

export function applyBackground(
  design: Pick<Design, "externalImageUrl" | "props">,
  value: string,
): { externalImageUrl: string; backgroundColor: string } | null {
  const token = resolveBackgroundToken(value, design);
  if (!token) return null;

  // Redbubble stores several uploads per work (one per product type); the listing preview
  // behind `externalImageUrl` is sometimes a different, wrong-aspect upload (e.g. a tiled
  // banner) rather than the actual tee artwork. The Classic Tee mockup upload is always the
  // correct portrait artwork, so prefer *its* image id as the base for every color — including
  // presets/raw tokens, not just "auto" — falling back to `externalImageUrl` when no mockup URL
  // is available.
  const mockupUrl = (design.props as { mockup_tshirt?: string } | undefined)?.mockup_tshirt;
  const sourceUrl =
    mockupUrl && REDBUBBLE_IMAGE_URL_RE.test(mockupUrl) ? mockupUrl : design.externalImageUrl;

  // Checked directly against the URL shape (not by comparing the rebuilt URL to the stored
  // one) — a design that already has this exact background applied must still resolve, so the
  // caller (setDesignBackgrounds) can tell "already applied" apart from "not a Redbubble image".
  if (!sourceUrl || !REDBUBBLE_IMAGE_URL_RE.test(sourceUrl)) return null;

  return { externalImageUrl: buildBackgroundImageUrl(sourceUrl, token), backgroundColor: tokenToHex(token) };
}
