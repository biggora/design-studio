import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { authorizeSyncRequest } from "@/lib/sync-auth";
import { isValidBackgroundValue } from "@/lib/background";
import { setDesignBackgrounds } from "@/lib/background-service";

type RequestBody = {
  color?: unknown;
  ids?: unknown;
  all?: unknown;
  dryRun?: unknown;
};

export async function POST(request: Request) {
  const denied = authorizeSyncRequest(request);
  if (denied) return denied;

  let body: RequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body.color !== "string" || !isValidBackgroundValue(body.color)) {
    return NextResponse.json({ error: "Invalid color" }, { status: 400 });
  }

  const hasIds = Array.isArray(body.ids) && body.ids.length > 0;
  const all = body.all === true;
  if (hasIds === all) {
    return NextResponse.json(
      { error: "Provide exactly one of a non-empty ids array or all:true" },
      { status: 400 },
    );
  }

  if (hasIds && (!(body.ids as unknown[]).every((id) => typeof id === "string") || (body.ids as unknown[]).length > 500)) {
    return NextResponse.json(
      { error: "ids must be an array of up to 500 strings" },
      { status: 400 },
    );
  }

  try {
    const result = await setDesignBackgrounds({
      color: body.color,
      ids: hasIds ? (body.ids as string[]) : undefined,
      all,
      dryRun: body.dryRun === true,
    });

    if (!result.dryRun && result.updated.length > 0) {
      revalidatePath("/", "layout");
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Error setting design backgrounds:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
