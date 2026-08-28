import {
  DEFAULT_ORDER_SETTINGS,
  orderSettingsSchema,
  type OrderSettings,
} from "@platform/schemas";

// The auto-confirm decision point (v1: built, exercised, and switched OFF).
//
// Pure and deterministic, exactly like decideAction in autonomy.ts: the model
// proposes a capture, this disposes. Nothing an LLM emits can widen it.

/** What the gate is asked about. Deliberately not the DB row — the gate is pure. */
export interface AutoConfirmInput {
  /** Extraction confidence the capture claimed. */
  captureConfidence: number | null;
  /**
   * Order value. NULL means "could not be computed", NEVER zero.
   *
   * Catalog prices are strings ("45k", "AED 85,000/yr", "حسب الطلب"), so a
   * total is often genuinely unknowable. Treating unknown as 0 would slip
   * every unpriceable order under every ceiling — the single most dangerous
   * bug this gate could contain.
   */
  totalEstimate: number | null;
  /** True when every line resolved to a catalog knowledge_item. */
  allItemsLinked: boolean;
  /** The boundary check from the drafting pipeline. */
  boundaryCheckPassed: boolean;
  /** Set when this capture edits an order the owner already decided on. */
  modifiesDecidedOrder: boolean;
}

/**
 * Always carries a reason, in both directions.
 *
 * A bare boolean is how "why is this still pending?" becomes unanswerable, and
 * this codebase has already paid for that twice. The reason is stored on the
 * order and shown in the Orders tab, the same way AutonomyDecision.reason is
 * surfaced on a waiting draft.
 */
export interface AutoConfirmDecision {
  confirm: boolean;
  reason: string;
}

function decide(confirm: boolean, reason: string): AutoConfirmDecision {
  return { confirm, reason };
}

/** Read the orders block out of `workspaces.autonomySettings`, safely. */
export function resolveOrderSettings(autonomySettings: unknown): OrderSettings {
  const orders = (autonomySettings as { orders?: unknown } | null | undefined)?.orders;
  if (!orders) return DEFAULT_ORDER_SETTINGS;
  const parsed = orderSettingsSchema.safeParse(orders);
  // A malformed settings blob must not be read as permission. Falling back to
  // the defaults means auto-confirm OFF, which is the safe direction.
  return parsed.success ? parsed.data : DEFAULT_ORDER_SETTINGS;
}

/**
 * Every check must pass. Any failure degrades to "owner confirms", never the
 * other way — the same precedence rule the autonomy engine follows.
 */
export function shouldAutoConfirm(
  input: AutoConfirmInput,
  settings: OrderSettings,
): AutoConfirmDecision {
  // 1. The master switch. v1 ships false, so this is the answer in production
  //    today — and it is still worth returning a reason rather than a bare no.
  if (!settings.autoConfirm) {
    return decide(false, "Auto-confirm is off — orders wait for you");
  }

  // 2. Boundaries outrank order settings, as everywhere else on the platform.
  if (!input.boundaryCheckPassed) {
    return decide(false, "Draft failed a boundary check");
  }

  // 3. Editing something already decided is the owner's call, always. Silently
  //    re-confirming a changed order would rewrite a commitment they made.
  if (input.modifiesDecidedOrder) {
    return decide(false, "Changes an order you already decided on");
  }

  // 4. Confidence floor.
  if (input.captureConfidence === null) {
    return decide(false, "No capture confidence recorded");
  }
  if (input.captureConfidence < settings.minConfidence) {
    return decide(
      false,
      `Capture confidence ${input.captureConfidence.toFixed(2)} below your ${settings.minConfidence.toFixed(2)} threshold`,
    );
  }

  // 5. Every line priced. An unmatched item is an unpriced item, so the total
  //    below would be wrong rather than merely unknown.
  if (settings.requireAllItemsLinked && !input.allItemsLinked) {
    return decide(false, "An item isn't matched to your catalog");
  }

  // 6. The value ceiling. NULL is a refusal, not a pass — see the field docs.
  if (input.totalEstimate === null) {
    return decide(false, "Order value couldn't be worked out from your catalog prices");
  }
  if (input.totalEstimate > settings.maxAutoConfirmValue) {
    return decide(
      false,
      `Order value ${input.totalEstimate} is above your ${settings.maxAutoConfirmValue} auto-confirm limit`,
    );
  }

  return decide(true, `Auto-confirmed — under ${settings.maxAutoConfirmValue}, all items matched`);
}
