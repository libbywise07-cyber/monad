import { NextResponse } from "next/server";
import { describeError } from "@/lib/claude";
import { lookupPlan } from "@/lib/server/planLookup";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const { school } = (await req.json().catch(() => ({}))) as { school?: string };
  const name = (school || "").trim();
  if (name.length < 2 || name.length > 120) return NextResponse.json({ error: "Enter your school's name" }, { status: 400 });
  try {
    return NextResponse.json(await lookupPlan(name));
  } catch (e) {
    return NextResponse.json({ error: describeError(e) }, { status: 502 });
  }
}
