import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { ArticleScheduleError } from "@/lib/article-scheduling";

export function articleScheduleJson(value: unknown, status = 200) {
  return NextResponse.json(value, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export function articleScheduleFailure(error: unknown) {
  if (error instanceof ArticleScheduleError)
    return articleScheduleJson({ error: error.message }, error.status);
  if (error instanceof SyntaxError)
    return articleScheduleJson({ error: "Invalid JSON body" }, 400);
  console.error("Article schedule operation failed");
  return articleScheduleJson(
    { error: "Article schedule operation failed" },
    500,
  );
}

export function revalidateArticlePages() {
  revalidatePath("/articles");
  revalidatePath("/sitemap.xml");
}
