

export interface Print     {
    id: number;
    externalId: number;
    title: string;
    externalLink: string;
    externalImageUrl: string;
    imageName: string;
    description: string;
    keywords: string;
    backgroundColors: string;
    backgroundColor: string;
    dimensions?: string;
    material?: string;
    price?: number;
    inStock?: boolean;
}