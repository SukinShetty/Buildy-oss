// vision-approvals.ts — main process ONLY
// Persistence for the vision gate: which exact provider+model combinations
// have PASSED the red-image vision check, keyed to a fingerprint of the API
// key used (so replacing the key invalidates the pass). The decision logic is
// pure and unit-tested in ai/vision-gate.ts; this file is the thin disk layer.
//
// SECURITY: only a short SHA-256 fingerprint of the key is stored — never the
// key itself.

import { app } from 'electron'
import * as fs from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import type { VisionApproval } from './ai/vision-gate'
import { isVisionApproved, upsertApproval, removeApproval } from './ai/vision-gate'

function filePath(): string {
  return join(app.getPath('userData'), 'vision-approvals.json')
}

/** Short, non-reversible fingerprint of an API key ('' for keyless providers). */
export function keyFingerprint(apiKey: string): string {
  return createHash('sha256').update(apiKey || '').digest('hex').slice(0, 16)
}

function load(): VisionApproval[] {
  try {
    const raw = JSON.parse(fs.readFileSync(filePath(), 'utf-8'))
    return Array.isArray(raw) ? (raw as VisionApproval[]) : []
  } catch {
    return []
  }
}

function persist(approvals: VisionApproval[]): void {
  try {
    fs.writeFileSync(filePath(), JSON.stringify(approvals, null, 2), 'utf-8')
  } catch (error) {
    console.warn('[VisionGate] could not persist approvals:', error)
  }
}

/** Record a PASSING vision check for provider+model with the key that ran it. */
export function recordVisionPass(provider: string, modelId: string, apiKey: string): void {
  const approval: VisionApproval = {
    provider,
    modelId,
    keyFingerprint: keyFingerprint(apiKey),
    passedAt: new Date().toISOString(),
  }
  persist(upsertApproval(load(), approval))
  console.log(`[VisionGate] vision check PASSED recorded for ${provider}/${modelId}`)
}

/** Record a FAILING vision check: any previous pass for provider+model is voided. */
export function recordVisionFail(provider: string, modelId: string): void {
  persist(removeApproval(load(), provider, modelId))
}

/** Has this exact provider+model passed the vision check with the CURRENT key? */
export function hasVisionPass(provider: string, modelId: string, apiKey: string): boolean {
  return isVisionApproved(load(), {
    provider,
    modelId,
    keyFingerprint: keyFingerprint(apiKey),
  })
}
