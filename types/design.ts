import type { CdnImage } from "@/lib/listings";

export interface Design {
  id: string;
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
  /** Set only through the listings ingest API; drives the CDN image preference in lib/image.ts. */
  cdnImage?: CdnImage | null;
  props?: object;
}
