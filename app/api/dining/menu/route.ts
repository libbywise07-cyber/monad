import { NextResponse } from "next/server";
import { getMenu } from "@/lib/server/dining";
import { schoolFromQuery } from "../school";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const school = schoolFromQuery(sp);
  const hall = sp.get("hall");
  if (!school || !hall) return NextResponse.json({ error: "school and hall are required" }, { status: 400 });
  try {
    return NextResponse.json(await getMenu(school, hall));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Couldn't load the menu" }, { status: 502 });
  }
}
