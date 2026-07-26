import { aiConfigured, callAi } from "@platform/ai";
import { getContextPack } from "@platform/brain";
import {
  buildLeadConciergePrompt,
  getDefinition,
  LEAD_CONCIERGE_PROMPT_REF,
  LEAD_CONCIERGE_PROMPT_VERSION,
  LEAD_CONCIERGE_SYSTEM,
} from "@platform/catalog";
import { getCreditStatus, takeLimit } from "@platform/core";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace, unauthorized } from "@/lib/workspace";
import { accountInactive } from "@/lib/activation";

const previewSchema = z.object({
  slug: z.string().max(100),
  config: z.record(z.unknown()).default({}),
  sampleMessage: z.string().min(1).max(1000),
});

/**
 * The trust keystone (Decision 004 §3.3): run the automation's real prompt on
 * a sample message BEFORE going live. Same system prompt, same context
 * assembly, same brain as production — the preview never lies.
 */
export async function POST(req: Request) {
  const ctx = await requireWorkspace();
  if (!ctx) return unauthorized();
  if (!ctx.user.isActive) return accountInactive();
  const parsed = previewSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const def = getDefinition(parsed.data.slug);
  if (!def) return NextResponse.json({ error: "Unknown automation" }, { status: 404 });
  const config = def.configSchema.safeParse(parsed.data.config);
  if (!config.success) {
    return NextResponse.json({ error: "Invalid configuration" }, { status: 400 });
  }
  if (!aiConfigured()) {
    return NextResponse.json(
      { error: "The AI engine isn't configured yet — previews need an AI provider key." },
      { status: 503 },
    );
  }
  const credits = await getCreditStatus(ctx.workspace.id);
  if (credits.exhausted) {
    return NextResponse.json(
      { error: "You're out of AI credits this month — upgrade on the Billing page." },
      { status: 402 },
    );
  }
  if (!(await takeLimit(`preview:${ctx.workspace.id}`, 20, 3600))) {
    return NextResponse.json({ error: "Preview limit reached — try again later." }, { status: 429 });
  }

  const { pack, brainVersion } = await getContextPack(
    ctx.workspace.id,
    ["identity", "voice", "policies", "boundaries", "faq_retrieval"],
    { queryText: parsed.data.sampleMessage },
  );

  const res = await callAi({
    workspaceId: ctx.workspace.id,
    promptRef: LEAD_CONCIERGE_PROMPT_REF,
    promptVersion: `${LEAD_CONCIERGE_PROMPT_VERSION}-preview`,
    tier: "frontier",
    system: LEAD_CONCIERGE_SYSTEM,
    prompt: buildLeadConciergePrompt({
      contextPack: pack,
      activationConfig: config.data ?? {},
      history: [],
      visitorMessage: parsed.data.sampleMessage,
    }),
    maxTokens: 1024,
    brainVersion,
  });

  try {
    const raw = res.text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
    const out = JSON.parse(raw) as {
      category?: string;
      reply?: string;
      reasoning?: string;
      usedFacts?: string[];
      needsHuman?: boolean;
    };
    return NextResponse.json({
      reply: out.reply ?? "",
      category: out.category ?? "unknown",
      reasoning: out.reasoning ?? "",
      usedFacts: out.usedFacts ?? [],
      needsHuman: out.needsHuman ?? false,
      confidence: (out as { confidence?: number }).confidence ?? 0,
      grounded: (out as { groundedOnContext?: boolean }).groundedOnContext ?? false,
      brainVersion,
    });
  } catch {
    return NextResponse.json(
      { error: "Preview generation failed — try again." },
      { status: 502 },
    );
  }
}
