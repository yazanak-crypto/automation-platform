export * from "./types";
export { leadConcierge, leadConciergeConfigSchema } from "./definitions/lead-concierge";
export * from "./definitions/lead-concierge-prompt";

import { leadConcierge as lc } from "./definitions/lead-concierge";
import type { AutomationDefinition } from "./types";

export const CATALOG: AutomationDefinition[] = [lc];

export function getDefinition(slug: string): AutomationDefinition | undefined {
  return CATALOG.find((d) => d.slug === slug);
}
