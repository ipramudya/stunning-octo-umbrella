export class ManualDecisionError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
