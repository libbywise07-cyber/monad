import { NextResponse } from "next/server";
import { listHalls } from "@/lib/server/dining";
import { schoolFromQuery } from "../school";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const school = schoolFromQuery(new URL(req.url).searchParams);
  if (!school) return NextResponse.json({ error: "Pick a school or paste a menu link" }, { status: 400 });
  try {
    return NextResponse.json({ school, halls: await listHalls(school) });
  } catch (e) {
    return NextResponse.json({ school, error: e instanceof Error ? e.message : "Couldn't load dining halls" }, { status: 502 });
  }
}
