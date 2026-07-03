// response-parser.ts
// Shared response parsing for all AI providers.
// Handles JSON extraction from noisy model output, field-level type coercion,
// and brainstorm project data extraction.
//
// Models — especially smaller/local ones — often return:
//   - JSON wrapped in markdown fences (```json ... ```)
//   - Explanation text before or after the JSON
//   - Partial or missing fields
//   - String values where arrays are expected
//   - Trailing commas in JSON
//
// This parser handles all of those cases gracefully.

import type { AnalysisResult, ExtractedProjectData, GoalAlignment } from '../../renderer/src/types'

/**
 * Parse raw model output text into a structured AnalysisResult.
 * Tries multiple strategies in order: direct parse → fence-stripped parse →
 * regex JSON extraction. Falls back to a user-friendly result if everything fails.
 */
export function parseAnalysisResponse(
  rawResponseText: string,
  startTime: number
): AnalysisResult {
  const parsed = extractJSON(rawResponseText)

  if (!parsed) {
    return buildFallbackAnalysisResult(rawResponseText, startTime)
  }

  return normalizeAnalysisResult(parsed, startTime)
}

/**
 * After a brainstorm conversation, the model may include a structured summary block.
 * This function tries to extract it.
 */
export function tryExtractProjectData(
  fullResponseText: string
): ExtractedProjectData | null {
  const summaryBlockMatch = fullResponseText.match(
    /---BUILDY_PROJECT_SUMMARY---([\s\S]+?)---END_BUILDY_PROJECT_SUMMARY---/
  )
  if (!summaryBlockMatch) return null

  const summaryBlock = summaryBlockMatch[1]

  function extractField(fieldName: string): string {
    const match = summaryBlock.match(new RegExp(`${fieldName}:\\s*(.+)`))
    return match ? match[1].trim() : ''
  }

  // FIRST_PROMPT is the last field in the block and may run long; capture
  // everything after its label to the end of the block (tolerates wrapping).
  function extractFirstPrompt(): string {
    const match = summaryBlock.match(/FIRST_PROMPT:\s*([\s\S]+?)\s*$/)
    return match ? match[1].trim() : ''
  }

  return {
    projectName: extractField('PROJECT_NAME'),
    productSummary: extractField('PRODUCT_SUMMARY'),
    targetUser: extractField('TARGET_USER'),
    coreProblem: extractField('CORE_PROBLEM'),
    brainstormSummary: extractField('MVP_FOCUS'),
    firstPrompt: extractFirstPrompt(),
  }
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

/**
 * Try to extract a JSON object from noisy model output.
 * Handles markdown fences, surrounding text, and trailing commas.
 */
function extractJSON(text: string): Record<string, unknown> | null {
  // Strategy 1: direct parse (model followed instructions perfectly)
  const trimmed = text.trim()
  const directResult = tryParse(trimmed)
  if (directResult) return directResult

  // Strategy 2: strip markdown fences and try again
  const stripped = stripMarkdownFences(trimmed)
  const strippedResult = tryParse(stripped)
  if (strippedResult) return strippedResult

  // Strategy 3: find the outermost { ... } in the text
  const braceMatch = findOutermostBraces(trimmed)
  if (braceMatch) {
    const braceResult = tryParse(braceMatch)
    if (braceResult) return braceResult
  }

  return null
}

function tryParse(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    // Try fixing trailing commas — common in weaker model output
    const fixed = text.replace(/,\s*([\]}])/g, '$1')
    try {
      const parsed = JSON.parse(fixed)
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      // genuinely unparseable
    }
  }
  return null
}

/**
 * Strip markdown code fences in all common variants:
 *   ```json\n...\n```
 *   ```JSON\n...\n```
 *   ```\n...\n```
 *   ~~~json\n...\n~~~
 */
function stripMarkdownFences(text: string): string {
  // Match fenced code blocks and extract their content
  const fenceMatch = text.match(/^[`~]{3,}(?:json|JSON)?\s*\n?([\s\S]*?)\n?\s*[`~]{3,}\s*$/m)
  if (fenceMatch) return fenceMatch[1].trim()

  // If fences aren't at the boundaries, try to find them inline
  const inlineMatch = text.match(/[`~]{3,}(?:json|JSON)?\s*\n([\s\S]*?)\n\s*[`~]{3,}/)
  if (inlineMatch) return inlineMatch[1].trim()

  return text
}

/**
 * Find the outermost matched { ... } in the text.
 * Uses brace counting rather than greedy regex to handle nested objects correctly.
 */
function findOutermostBraces(text: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < text.length; i++) {
    const char = text[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }

    if (char === '\\' && inString) {
      escapeNext = true
      continue
    }

    if (char === '"') {
      inString = !inString
      continue
    }

    if (inString) continue

    if (char === '{') {
      if (depth === 0) start = i
      depth++
    } else if (char === '}') {
      depth--
      if (depth === 0 && start !== -1) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

// ─── Field normalization ─────────────────────────────────────────────────────

/**
 * Normalize a parsed JSON object into a valid AnalysisResult.
 * Coerces types: strings become single-element arrays where arrays are expected,
 * missing fields get safe defaults.
 */
function normalizeAnalysisResult(
  parsed: Record<string, unknown>,
  startTime: number
): AnalysisResult {
  return {
    screenContentVisible: toBool(parsed.screenContentVisible, false),
    whatIsHappening: toStr(parsed.whatIsHappening, ''),
    whatItMeans: toStr(parsed.whatItMeans, ''),
    whatIsBuilt: toStrArray(parsed.whatIsBuilt),
    whatIsMissing: toStrArray(parsed.whatIsMissing),
    whatIsBroken: toStrArray(parsed.whatIsBroken),
    whereUserIsStuck: parsed.whereUserIsStuck != null ? toStr(parsed.whereUserIsStuck, null) : null,
    bestNextMove: toStr(parsed.bestNextMove, ''),
    nextPrompt: toStr(parsed.nextPrompt, ''),
    expectedOutcome: parsed.expectedOutcome != null ? toStr(parsed.expectedOutcome, '') : undefined,
    builderNote: toStr(parsed.builderNote, ''),
    goalAlignment: toGoalAlignment(parsed.goalAlignment),
    alignmentNote: parsed.alignmentNote != null ? toStr(parsed.alignmentNote, '') : undefined,
    projectUnderstandingNote: parsed.projectUnderstandingNote != null ? toStr(parsed.projectUnderstandingNote, '') : undefined,
    isCriticalOverride: toBool(parsed.isCriticalOverride, false),
    needsHumanJudgment: toBool(parsed.needsHumanJudgment, false),
    humanJudgmentReason: parsed.humanJudgmentReason != null ? toStr(parsed.humanJudgmentReason, '') : undefined,
    analyzedAt: new Date().toISOString(),
    analysisDurationMs: Date.now() - startTime,
  }
}

/**
 * Coerce a value to a valid GoalAlignment, or null if absent/unrecognized.
 * Tolerates minor model variations like "on track" or "ontrack".
 */
function toGoalAlignment(value: unknown): GoalAlignment | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-')
  if (normalized === 'on-track' || normalized === 'ontrack') return 'on-track'
  if (normalized === 'drift' || normalized === 'drifting') return 'drift'
  if (normalized === 'blocked') return 'blocked'
  return null
}

function toBool(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') return value
  if (value === 'true') return true
  if (value === 'false') return false
  return fallback
}

function toStr(value: unknown, fallback: string | null): string {
  if (typeof value === 'string') return value
  if (value === null || value === undefined) return fallback ?? ''
  return String(value)
}

/**
 * Coerce a value to a string array.
 * Handles: actual arrays, single strings, null/undefined, numbers.
 */
function toStrArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v))
  if (typeof value === 'string' && value.trim()) return [value]
  return []
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function buildFallbackAnalysisResult(rawText: string, startTime: number): AnalysisResult {
  return {
    screenContentVisible: false,
    whatIsHappening: rawText.slice(0, 300),
    whatItMeans: 'Buildy had trouble reading the response. Try analyzing again.',
    whatIsBuilt: [],
    whatIsMissing: [],
    whatIsBroken: [],
    whereUserIsStuck: null,
    bestNextMove: 'Click "Analyze Now" again to get a fresh read.',
    nextPrompt: '',
    builderNote: 'No worries — sometimes it takes a second try!',
    analyzedAt: new Date().toISOString(),
    analysisDurationMs: Date.now() - startTime,
  }
}
