import { NextResponse } from "next/server";
import { z } from "zod";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { claude, describeError, hasClaudeCredentials, MODEL } from "@/lib/claude";

export const runtime = "nodejs";
export const maxDuration = 120;

const ScanZ = z.object({
  items: z.array(
    z.object({
      name: z.string().describe("generic grocery name, lowercase, e.g. 'eggs', 'greek yogurt', 'rice'"),
      quantity: z.string().describe("rough amount visible, e.g. '6', 'half jar', '1 bag'"),
      category: z.enum(["produce", "dairy", "protein", "grains", "canned", "frozen", "snacks", "condiments", "drinks", "other"]),
    }),
  ),
});

type Media = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export async function POST(req: Request) {
  const { images } = (await req.json()) as { images: { data: string; mediaType: Media }[] };
  if (!images?.length) return NextResponse.json({ error: "No images provided" }, { status: 400 });
  if (!hasClaudeCredentials())
    return NextResponse.json(
      { error: "AI scanning needs ANTHROPIC_API_KEY set on the server. You can still add items manually." },
      { status: 503 },
    );

  try {
    const response = await claude().beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ScanZ) },
      messages: [
        {
          role: "user",
          content: [
            ...images.slice(0, 4).map((img) => ({
              type: "image" as const,
              source: { type: "base64" as const, media_type: img.mediaType, data: img.data },
            })),
            {
              type: "text" as const,
              text: "These are photos of a college student's fridge and/or pantry. List every food item you can identify that could be used for cooking or snacking. Merge duplicates. Skip non-food items. If you are unsure what something is, give your best generic guess.",
            },
          ],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("the request was declined");
    return NextResponse.json({ items: response.parsed_output?.items ?? [] });
  } catch (err) {
    return NextResponse.json({ error: describeError(err) }, { status: 502 });
  }
}
