export class EvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}
