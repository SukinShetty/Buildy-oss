// vision-gate.ts — PURE decision logic for the vision gate.
// Watching is allowed ONLY after a vision check passed for that exact
// provider + model. The pass records a fingerprint of the API key used, so a
// key change automatically invalidates it (persistence lives in
// ../vision-approvals.ts; this module has no electron imports and is
// unit-tested directly).

export interface VisionApproval {
  provider: string
  modelId: string
  keyFingerprint: string   // hash of the API key used for the passing check ('' key hashes too)
  passedAt: string         // ISO timestamp
}

export interface VisionIdentity {
  provider: string
  modelId: string
  keyFingerprint: string
}

/** Is watching allowed for this exact provider + model + key? */
export function isVisionApproved(approvals: VisionApproval[], current: VisionIdentity): boolean {
  return approvals.some(
    (a) =>
      a.provider === current.provider &&
      a.modelId === current.modelId &&
      a.keyFingerprint === current.keyFingerprint
  )
}

/**
 * Record a passing check: one approval per provider+model — a re-check with a
 * new key REPLACES the old entry (the old key's pass is void anyway).
 */
export function upsertApproval(approvals: VisionApproval[], approval: VisionApproval): VisionApproval[] {
  const rest = approvals.filter(
    (a) => !(a.provider === approval.provider && a.modelId === approval.modelId)
  )
  return [...rest, approval]
}

/** Remove the approval for a provider+model (a check just FAILED for it). */
export function removeApproval(
  approvals: VisionApproval[],
  provider: string,
  modelId: string
): VisionApproval[] {
  return approvals.filter((a) => !(a.provider === provider && a.modelId === modelId))
}
