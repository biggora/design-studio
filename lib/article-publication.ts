import {
  articleSlug,
  type ArticleRecord,
  type PublishedArticle,
} from "@/lib/articles";

type Post = {
  id_string: string;
  post_url: string;
  timestamp: number;
  state?: string;
};

/** Only the public posts endpoint is used: owner authorization must never reveal drafts. */
export async function resolveArticlePublications(
  articles: ArticleRecord[],
  apiKey: string,
  request: typeof fetch = fetch,
): Promise<Map<string, PublishedArticle | null>> {
  const result = new Map<string, PublishedArticle | null>();
  const pages = new Map<string, Promise<Post[]>>();
  async function posts(blog: string, params: Record<string, string>) {
    const url = new URL(
      `https://api.tumblr.com/v2/blog/${encodeURIComponent(blog)}/posts`,
    );
    url.search = new URLSearchParams({
      api_key: apiKey,
      npf: "true",
      ...params,
    }).toString();
    const response = await request(url, {
      headers: { "User-Agent": "design-studio-articles/1.0" },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 404 && params.id)
      return { posts: [] as Post[], total_posts: 0 };
    if (!response.ok)
      throw new Error(`Tumblr publication check failed (${response.status})`);
    const body = await response.json();
    if (body.meta?.status !== 200 || !Array.isArray(body.response?.posts))
      throw new Error("Invalid Tumblr publication response");
    for (const post of body.response.posts) {
      if (
        typeof post.id_string !== "string" ||
        !/^\d+$/.test(post.id_string) ||
        typeof post.post_url !== "string" ||
        !Number.isFinite(post.timestamp)
      )
        throw new Error("Invalid Tumblr public post");
    }
    return body.response as { posts: Post[]; total_posts: number };
  }
  async function allPosts(blog: string): Promise<Post[]> {
    const all: Post[] = [];
    const seen = new Set<string>();
    for (let offset = 0; ; offset += 20) {
      const page = await posts(blog, { limit: "20", offset: String(offset) });
      if (!page.posts.length) break;
      for (const post of page.posts) {
        if (seen.has(post.id_string))
          throw new Error("Tumblr pagination changed during verification");
        seen.add(post.id_string);
        all.push(post);
      }
      if (page.posts.length < 20 || all.length >= page.total_posts) break;
    }
    return all;
  }
  for (const article of articles) {
    const direct = (await posts(article.blog, { id: article.tumblrPostId }))
      .posts;
    let post = direct.find((p) => p.id_string === article.tumblrPostId);
    if (!post) {
      if (!pages.has(article.blog))
        pages.set(article.blog, allPosts(article.blog));
      const matches = (await pages.get(article.blog)!).filter(
        (p) => articleSlug(p.post_url) === articleSlug(article.tumblrUrl),
      );
      if (matches.length === 1) post = matches[0];
    }
    let publication: PublishedArticle | null = null;
    if (post && (!post.state || post.state === "published")) {
      const url = new URL(post.post_url);
      if (
        url.protocol !== "https:" ||
        url.host !== article.blog ||
        url.username ||
        url.password ||
        !url.pathname.startsWith(`/post/${post.id_string}/`)
      )
        throw new Error("Tumblr returned an unexpected article URL");
      publication = {
        sourceArticleId: article.sourceArticleId,
        title: article.title,
        excerpt: article.excerpt,
        imageUrl: article.imageUrl,
        imageAlt: article.imageAlt,
        url: url.href,
        publishedAt: new Date(post.timestamp * 1000).toISOString(),
      };
    }
    result.set(`${article.blog}:${article.sourceArticleId}`, publication);
  }
  return result;
}
