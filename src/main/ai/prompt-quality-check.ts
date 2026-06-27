// prompt-quality-check.ts — main process
// Part C, Intelligence Fix 2: a fast, cheap SECOND-PASS grader for the
// suggestedPrompt (nextPrompt) field of an analysis.
//
// It asks Haiku 4.5 — fast + cheap — to grade the prompt against the user's goal
// and project memory. If the prompt is weak and Haiku can improve it, we swap in
// the improved version; if it's weak with no fix, we blank it and explain.
//
// CRITICAL: this NEVER blocks the main analysis flow. The caller fires it AFTER
// the analysis is already on screen, then patches the prompt if the grade comes
// back. If the grader call fails or the provider isn't usable, we return
// { valid: true } so the original prompt is kept untouched.

import type { AnalysisResult, AppSettings, Goal } from '../../renderer/src/types'
import { fetchWithTimeout } from './fetch-with-timeout'

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'

export interface PromptQualityResult {
  valid: boolean
  reason?: string
  improvedPrompt?: string
}

/**
 * Grade (and optionally improve) an analysis's suggested prompt.
 * Returns { valid: true } unchanged on any error so the caller keeps the original.
 */
export async function checkPromptQuality(
  analysis: AnalysisResult,
  memoryContext: string,
  goal: Goal | null,
  settings: AppSettings
): Promise<PromptQualityResult> {
  const prompt = (analysis.nextPrompt || '').trim()
  if (!prompt) {
    // Nothing to grade — the model already decided no prompt was appropriate.
    return { valid: true }
  }

  const graderSystem =
    'You are a prompt quality grader. Respond with JSON only, no markdown, no prose.'
  const graderUser = buildGraderPrompt(prompt, memoryContext, goal)

  try {
    const text = await callGrader(graderSystem, graderUser, settings)
    if (!text) return { valid: true }

    const json = extractJson(text)
    if (!json) {
      console.warn('[PromptQuality] Grader returned unparseable output — keeping original')
      return { valid: true }
    }

    const valid = json.valid !== false
    const improved = typeof json.improvedPrompt === 'string' ? json.improvedPrompt.trim() : ''
    console.log(`[PromptQuality] valid=${valid} reason="${json.reason || ''}" improved=${improved ? 'yes' : 'no'}`)
    return {
      valid,
      reason: typeof json.reason === 'string' ? json.reason : undefined,
      improvedPrompt: improved || undefined,
    }
  } catch (error) {
    console.warn('[PromptQuality] Grader error — keeping original prompt:', error)
    return { valid: true }
  }
}

function buildGraderPrompt(prompt: string, memoryContext: string, goal: Goal | null): string {
  return `You are a prompt quality grader. Grade this suggested next prompt for a non-technical builder using Claude Code:

1. Is it specific to the user's project? (not generic)
2. Is it ONE concrete action?
3. Does it align with the user's goal?
4. Does it reference things from project memory correctly?
5. Is it non-redundant (does not suggest already-completed work)?

User's goal: ${goal?.purpose || '(not set)'}
Project memory:
${memoryContext || '(none yet)'}

Suggested prompt: ${prompt}

Respond JSON only:
{
  "valid": true/false,
  "reason": "<why if not valid>",
  "improvedPrompt": "<rewritten prompt if you can improve it, otherwise empty string>"
}`
}

/**
 * Call the grader. Prefers Haiku via the Anthropic API (incl. proxy mode). If the
 * configured provider is not Anthropic we fall back to the user's analysis model
 * via the same Anthropic-style call ONLY when an Anthropic key exists; otherwise
 * we skip (return '') so the original prompt is kept.
 */
async function callGrader(
  system: string,
  user: string,
  settings: AppSettings
): Promise<string> {
  const isAnthropic = settings.provider === 'anthropic'
  const usingProxy = settings.useProxy && !!settings.proxyUrl

  // We can only run the grader through the Anthropic Messages shape here. That's
  // available when the provider is Anthropic, or when a proxy is configured.
  if (!isAnthropic && !usingProxy) {
    console.log('[PromptQuality] Non-Anthropic provider and no proxy — skipping grader')
    return ''
  }
  if (!usingProxy && !settings.apiKey) {
    console.log('[PromptQuality] No Anthropic API key — skipping grader')
    return ''
  }

  // Haiku for speed/cost; fall back to the analysis model only if Haiku id is
  // somehow rejected (handled by the catch in the caller).
  const model = isAnthropic ? HAIKU_MODEL : (settings.modelId || HAIKU_MODEL)
  const url = usingProxy ? `${settings.proxyUrl.replace(/\/$/, '')}/chat` : 'https://api.anthropic.com/v1/messages'
  const headers: Record<string, string> = usingProxy
    ? { 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json', 'x-api-key': settings.apiKey, 'anthropic-version': '2023-06-01' }

  const body = {
    model,
    max_tokens: 400,
    system,
    messages: [{ role: 'user', content: [{ type: 'text', text: user }] }],
  }

  const response = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    console.warn(`[PromptQuality] Grader HTTP ${response.status} — skipping`)
    return ''
  }
  const json = (await response.json()) as { content?: Array<{ type: string; text?: string }> }
  return json.content?.find((b) => b.type === 'text')?.text || ''
}

function extractJson(text: string): Record<string, unknown> | null {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as Record<string, unknown>
  } catch {
    return null
  }
}
