import type { OgImage } from "@pod/og-renderer/contract";
import type {GiftTopic} from "@/lib/gift-selection";
import type { CdnImage } from "@/lib/listings";
import type { PinterestImage } from "@pod/pinterest-renderer/contract";

/** One picked CDN artwork (key + main-variant size) — what getDesignImage resolves
 * from the design's stored mockup array for a given surface orientation. */
export type CdnArtwork = { key: string; version: number; width: number; height: number };

export interface Design {
  id: string;
  /** Internal uploader identity; public DTOs omit this field. */
  sha256?: string;
  externalId: number | null;
  title: string;
  slug?: string | null;
  externalLink: string;
  externalImageUrl: string;
  category: string;
  collection: string;
  imageName: string;
  description: string;
  keywords: string;
  backgroundColors: string;
  backgroundColor: string;
  createdAt: string;
  updatedAt: string;
  dimensions?: string;
  material?: string;
  price?: number;
  inStock?: boolean;
  shared?: boolean;
  /** The manual publish switch: false hides the print from every public surface and 404s its
   * direct URLs. Defaults to true; the scrapes never rewrite it — it changes only through
   * POST /api/designs/active or the matching CLI. */
  active?: boolean;
  /** The design's pod-uploader CDN mockups (whole stored array — flat-full/flat-close/
   * hanger-full/hanger-close; a legacy single display object arrives wrapped as its flat-full
   * entry). Each surface picks its own orientation in lib/image.ts. */
  cdnImage?: CdnImage | null;
  pinterestImage?: PinterestImage | null;
  ogImage?: OgImage | null;
  /** null/missing: infer from subject metadata; []: exclude; array: reviewed gift subjects. */
  giftTopics?: GiftTopic[] | null;
  props?: object;
}
