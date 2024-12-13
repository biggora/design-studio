export interface Design {
  id: number;
  externalId: number;
  title: string;
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
  props?: object;
}
