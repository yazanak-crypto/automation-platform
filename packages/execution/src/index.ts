// @platform/execution — ExecutionAdapter interface (Decisions 003/005).
// The ONLY package allowed to know which engine runs workflows.
// ActivepiecesAdapter lands after the M1 step-5 de-risk spike.

export interface ExecutionAdapter {
  deployTemplate(templateRef: string, version: string): Promise<{ engineRef: string }>;
  activate(activationId: string, engineRef: string, config: Record<string, unknown>): Promise<{ engineActivationRef: string }>;
  deactivate(engineActivationRef: string): Promise<void>;
  trigger(engineActivationRef: string, payload: unknown): Promise<{ engineRunId: string }>;
}
