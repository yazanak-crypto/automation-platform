import {
  RISK_TIERS,
  type ActivationAutonomyOverrides,
  type AutonomyAction,
  type AutonomyPolicy,
  type Category,
  type WorkspaceAutonomySettings,
} from "@platform/schemas";

// The autonomy decision engine (Decision 012). Pure and deterministic — the
// LLM proposes (category, confidence, grounding); this function disposes.
// No LLM output can widen autonomy beyond the resolved policy.

export interface EffectivePolicy {
  categoryActions: Record<Category, AutonomyAction>;
  minConfidence: number;
}

const TIER_RANK = { none: 0, low: 1, medium: 2 } as const;
const RISK_RANK = { low: 1, medium: 2, high: 3 } as const;

/**
 * Layered resolution (Decision 012): activation override > workspace setting
 * > automation default > approve. Safety floor: HIGH-risk categories can
 * never resolve to `auto` in M1, regardless of any layer.
 */
export function resolvePolicy(
  automationDefault: AutonomyPolicy,
  workspace: WorkspaceAutonomySettings | null | undefined,
  activation: ActivationAutonomyOverrides | null | undefined,
): EffectivePolicy {
  const maxAutoRisk = workspace?.maxAutoRisk ?? "medium";
  const categoryActions = {} as Record<Category, AutonomyAction>;

  for (const category of Object.keys(RISK_TIERS) as Category[]) {
    const risk = RISK_TIERS[category];
    let action: AutonomyAction =
      activation?.categoryOverrides?.[category] ??
      workspace?.categoryOverrides?.[category] ??
      automationDefault.categoryActions[category] ??
      "approve";

    // Workspace risk-tolerance dial caps auto (does not touch approve/escalate).
    if (action === "auto" && risk !== "high" && RISK_RANK[risk] > TIER_RANK[maxAutoRisk]) {
      action = "approve";
    }
    // M1 safety floor: high risk never auto — enforced here, not in the UI.
    if (risk === "high" && action === "auto") {
      action = "approve";
    }
    categoryActions[category] = action;
  }

  return {
    categoryActions,
    minConfidence: activation?.minConfidence ?? automationDefault.minConfidence,
  };
}

export interface AutonomyInput {
  mode: "supervised" | "smart";
  policy: EffectivePolicy;
  category: Category;
  confidence: number;
  grounded: boolean;
  boundaryCheckPassed: boolean;
  needsHuman: boolean;
  hasReply: boolean;
}

export interface AutonomyDecision {
  action: "auto_send" | "draft_for_approval" | "escalate";
  /** True when Supervised Mode downgraded an auto_send — graduation evidence. */
  wouldAutoSend: boolean;
  reason: string;
}

/**
 * Precedence (Decision 012 §2): escalate > approval > auto > default(approve).
 * Every gate that fails degrades toward the safer action, never the other way.
 */
export function decideAction(input: AutonomyInput): AutonomyDecision {
  const configured = input.policy.categoryActions[input.category];
  const risk = RISK_TIERS[input.category];

  // 1. Escalation gates — absolute, in every mode.
  if (configured === "escalate") {
    return done("escalate", false, `${label(input.category)} always goes to you (${risk} risk)`);
  }
  // An empty reply normally means the model declined to answer, which is a
  // request for a human. `order_intent` is the one exception: the drafting
  // prompt instructs it to leave the reply empty on purpose, because the
  // customer acknowledgement is rendered server-side from the SAVED order
  // rather than generated. Escalating on that emptiness made every single
  // order escalate before the capture code could run — order capture could
  // never fire at all, deterministically, and the run just read "The AI judged
  // this needs you personally".
  //
  // Narrow on purpose: `needsHuman` still escalates order_intent, which is how
  // "commits but I cannot tell WHAT they want" reaches the owner, and an empty
  // reply still escalates every other category.
  const emptyReplyMeansEscalate = !input.hasReply && input.category !== "order_intent";
  if (input.needsHuman || emptyReplyMeansEscalate) {
    return done("escalate", false, "The AI judged this needs you personally");
  }

  // 2. Auto gates — ALL must pass; any failure degrades to approval.
  if (configured === "auto") {
    if (!input.boundaryCheckPassed) {
      return done("escalate", false, "Draft failed a boundary check");
    }
    if (!input.grounded) {
      return draft(input, false, `Answer isn't fully backed by your confirmed Business Brain`);
    }
    if (input.confidence < input.policy.minConfidence) {
      return draft(input, false, `Confidence ${input.confidence.toFixed(2)} below your ${input.policy.minConfidence.toFixed(2)} threshold`);
    }
    // Eligible for auto-handling.
    if (input.mode === "supervised") {
      return draft(input, true, `Would have been handled automatically (${label(input.category)}, grounded, confidence ${input.confidence.toFixed(2)})`);
    }
    return done("auto_send", true, `${label(input.category)} · grounded · confidence ${input.confidence.toFixed(2)}`);
  }

  // 3. Approval (configured or default).
  if (!input.boundaryCheckPassed) {
    return done("escalate", false, "Draft failed a boundary check");
  }
  return draft(input, false, `${label(input.category)} is set to require your approval`);
}

function done(
  action: AutonomyDecision["action"],
  wouldAutoSend: boolean,
  reason: string,
): AutonomyDecision {
  return { action, wouldAutoSend, reason };
}

function draft(_input: AutonomyInput, wouldAutoSend: boolean, reason: string): AutonomyDecision {
  return { action: "draft_for_approval", wouldAutoSend, reason };
}

function label(category: Category): string {
  return category.replace(/_/g, " ");
}

/**
 * Audit-2 P0-3: the escalation holding line is itself a customer-facing
 * message, so it only auto-sends in Smart Mode. Supervised Mode sends
 * nothing without approval — the letter of the promise, not just the spirit.
 */
export function shouldSendHoldingLine(
  mode: "supervised" | "smart",
  overrides: { holdingLineEnabled?: boolean } | null | undefined,
): boolean {
  return mode === "smart" && overrides?.holdingLineEnabled !== false;
}
