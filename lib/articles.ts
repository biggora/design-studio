export type ArticleAnnouncement = {
  sourceArticleId: string;
  blog: string;
  tumblrPostId: string;
  tumblrUrl: string;
  title: string;
  excerpt: string;
  imageUrl: string;
  imageSha256: string;
  imageAlt: string;
};

export type PublishedArticle = Pick<
  ArticleAnnouncement,
  "sourceArticleId" | "title" | "excerpt" | "imageUrl" | "imageAlt"
> & {
  url: string;
  publishedAt: string;
};

export type ArticleRecord = ArticleAnnouncement & {
  revision: string;
  checkedAt: string | null;
  publication: PublishedArticle | null;
};

export function articleSlug(value: string): string {
  return new URL(value).pathname.match(/^\/post\/\d+\/([^/]+)\/?$/)?.[1] ?? "";
}

export function parseArticleAnnouncement(value: unknown): ArticleAnnouncement {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Expected an article object");
  const input = value as Record<string, unknown>;
  const field = (name: string, max: number): string => {
    const text = input[name];
    if (typeof text !== "string" || !text.trim() || text.length > max)
      throw new Error(`Invalid ${name}`);
    return text.trim();
  };
  const article: ArticleAnnouncement = {
    sourceArticleId: field("sourceArticleId", 100),
    blog: field("blog", 253).toLowerCase(),
    tumblrPostId: field("tumblrPostId", 30),
    tumblrUrl: field("tumblrUrl", 2000),
    title: field("title", 300),
    excerpt: field("excerpt", 2000),
    imageUrl: field("imageUrl", 2000),
    imageSha256: field("imageSha256", 64).toLowerCase(),
    imageAlt: field("imageAlt", 1000),
  };
  if (!/^[a-zA-Z0-9_-]+$/.test(article.sourceArticleId))
    throw new Error("Invalid sourceArticleId");
  if (!/^[a-z0-9-]+\.tumblr\.com$/.test(article.blog))
    throw new Error("Invalid blog");
  if (!/^\d+$/.test(article.tumblrPostId))
    throw new Error("Invalid tumblrPostId");
  if (!/^[a-f0-9]{64}$/.test(article.imageSha256))
    throw new Error("Invalid imageSha256");
  const post = new URL(article.tumblrUrl);
  if (
    post.protocol !== "https:" ||
    post.host !== article.blog ||
    post.username ||
    post.password ||
    !post.pathname.startsWith(`/post/${article.tumblrPostId}/`) ||
    !articleSlug(article.tumblrUrl)
  ) {
    throw new Error(
      "tumblrUrl must address the registered blog, post ID and slug",
    );
  }
  post.search = "";
  post.hash = "";
  article.tumblrUrl = post.href;
  const image = new URL(article.imageUrl);
  const cdn = process.env.NEXT_PUBLIC_IMAGES_CDN;
  if (!cdn)
    throw new Error("NEXT_PUBLIC_IMAGES_CDN is required for article covers");
  const base = new URL(cdn.endsWith("/") ? cdn : `${cdn}/`);
  if (
    image.protocol !== "https:" ||
    image.origin !== base.origin ||
    image.username ||
    image.password ||
    !image.pathname.startsWith(`${base.pathname}articles/`) ||
    !image.pathname.includes(article.imageSha256) ||
    image.search ||
    image.hash
  ) {
    throw new Error(
      "imageUrl must be an immutable article cover on the configured CDN",
    );
  }
  return article;
}
