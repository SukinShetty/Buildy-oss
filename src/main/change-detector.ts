// change-detector.ts — main process
// Determines whether a new screenshot is meaningfully different from the previous one,
// and whether a new analysis result says something new worth speaking about.
//
// Two-level gating:
//   1. Image-level: pixel sampling to skip AI calls when nothing visually changed
//   2. Analysis-level: field comparison to skip voice when the AI says the same thing

import type { AnalysisResult } from '../renderer/src/types'

// ─── Image-level change detection ────────────────────────────────────────────

/**
 * Compare two base64 JPEG images by decoding and sampling pixels.
 * Returns a number 0–1 representing the fraction of sampled pixels that changed.
 * Uses NativeImage for decoding (available in Electron main process).
 */
export function computeImageChangeFraction(
  previousBase64: string,
  currentBase64: string
): number {
  // Fast path: identical strings (exact same screenshot)
  if (previousBase64 === currentBase64) return 0

  // Decode both images to raw RGBA bitmaps via Electron's nativeImage
  const { nativeImage } = require('electron')

  const prevImg = nativeImage.createFromBuffer(
    Buffer.from(previousBase64, 'base64')
  )
  const currImg = nativeImage.createFromBuffer(
    Buffer.from(currentBase64, 'base64')
  )

  const prevBitmap = prevImg.toBitmap()
  const currBitmap = currImg.toBitmap()

  // If sizes differ, treat as fully changed
  const prevSize = prevImg.getSize()
  const currSize = currImg.getSize()
  if (prevSize.width !== currSize.width || prevSize.height !== currSize.height) {
    return 1.0
  }

  // Sample ~200 evenly distributed pixels and compare RGBA values
  const totalPixels = prevSize.width * prevSize.height
  const sampleCount = Math.min(200, totalPixels)
  const step = Math.max(1, Math.floor(totalPixels / sampleCount))

  let changedCount = 0
  let sampledCount = 0

  for (let i = 0; i < totalPixels; i += step) {
    const offset = i * 4 // RGBA = 4 bytes per pixel
    if (offset + 3 >= prevBitmap.length || offset + 3 >= currBitmap.length) break

    sampledCount++

    // Compare RGB (ignore alpha). Allow a small threshold for JPEG compression noise.
    const dr = Math.abs(prevBitmap[offset] - currBitmap[offset])
    const dg = Math.abs(prevBitmap[offset + 1] - currBitmap[offset + 1])
    const db = Math.abs(prevBitmap[offset + 2] - currBitmap[offset + 2])

    if (dr + dg + db > 30) {
      changedCount++
    }
  }

  return sampledCount > 0 ? changedCount / sampledCount : 0
}

/** Threshold: below this, don't bother calling the AI.
 *  5% is sensitive enough for terminal text changes. */
export const IMAGE_CHANGE_THRESHOLD = 0.05

// ─── Analysis-level change detection ─────────────────────────────────────────

export type ChangeType = 'blocker' | 'completion' | 'new_step' | 'progress' | 'error'

export interface AnalysisChangeResult {
  isSignificant: boolean
  isHighPriority: boolean  // true for blockers/completions — speaks even in quiet mode
  whatChanged: ChangeType | null
  whatHappened: string     // short description of what changed (for voice formatting)
  bestNextMove: string     // short next step (for voice formatting)
}

/**
 * Compare two analysis results and determine if something meaningful changed.
 * Uses word-level similarity to avoid triggering on minor AI rephrasing.
 */
export function detectAnalysisChange(
  previous: AnalysisResult | null,
  current: AnalysisResult
): AnalysisChangeResult {
  const noChange: AnalysisChangeResult = {
    isSignificant: false,
    isHighPriority: false,
    whatChanged: null,
    whatHappened: '',
    bestNextMove: '',
  }

  // First analysis ever — significant but not high priority
  if (!previous) {
    return {
      isSignificant: true,
      isHighPriority: false,
      whatChanged: 'new_step',
      whatHappened: current.whatIsHappening,
      bestNextMove: current.bestNextMove,
    }
  }

  // Check for new errors/blockers — HIGH PRIORITY
  const newBroken = current.whatIsBroken.filter(
    (item) => !previous.whatIsBroken.some((prev) => wordSimilarity(prev, item) > 0.6)
  )
  if (newBroken.length > 0) {
    return {
      isSignificant: true,
      isHighPriority: true,
      whatChanged: 'blocker',
      whatHappened: current.whatIsHappening,
      bestNextMove: current.bestNextMove,
    }
  }

  // Check for stuck state appearing — HIGH PRIORITY
  if (current.whereUserIsStuck && !previous.whereUserIsStuck) {
    return {
      isSignificant: true,
      isHighPriority: true,
      whatChanged: 'blocker',
      whatHappened: 'You might be stuck',
      bestNextMove: current.bestNextMove,
    }
  }

  // Check for new completed features — HIGH PRIORITY
  const newBuilt = current.whatIsBuilt.filter(
    (item) => !previous.whatIsBuilt.some((prev) => wordSimilarity(prev, item) > 0.6)
  )
  if (newBuilt.length > 0) {
    return {
      isSignificant: true,
      isHighPriority: true,
      whatChanged: 'completion',
      // No " is done" suffix — the formatter announces it ("Good news. <X>.").
      whatHappened: newBuilt[0],
      bestNextMove: current.bestNextMove,
    }
  }

  // Check if the main activity changed meaningfully (not just rephrased)
  const happeningSimilarity = wordSimilarity(
    previous.whatIsHappening,
    current.whatIsHappening
  )
  const nextMoveSimilarity = wordSimilarity(
    previous.bestNextMove,
    current.bestNextMove
  )

  // New step: EITHER what's happening or next move changed substantially
  if (happeningSimilarity < 0.45 || nextMoveSimilarity < 0.4) {
    // Determine if it's a new step or just progress
    const isNewStep = happeningSimilarity < 0.45
    return {
      isSignificant: true,
      isHighPriority: false,
      whatChanged: isNewStep ? 'new_step' : 'progress',
      whatHappened: current.whatIsHappening,
      bestNextMove: current.bestNextMove,
    }
  }

  // Nothing meaningful changed
  return noChange
}

// ─── Word-level similarity ───────────────────────────────────────────────────

/**
 * Compute Jaccard similarity between two strings based on their word sets.
 * Returns 0 (completely different) to 1 (identical words).
 * This is intentionally fuzzy — it catches AI rephrasing the same idea.
 */
function wordSimilarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0

  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter((w) => w.length > 2))
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter((w) => w.length > 2))

  if (wordsA.size === 0 && wordsB.size === 0) return 1

  let intersection = 0
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++
  }

  const union = wordsA.size + wordsB.size - intersection
  return union > 0 ? intersection / union : 0
}
