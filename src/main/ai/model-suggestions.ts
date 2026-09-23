// model-suggestions.ts — rule-based "Suggested" tag for the model picker.
// A tag is ONLY ever applied to a model actually present in the live list
// (the rules pick from the fetched ids — nothing is invented, nothing is
// pre-selected). Rules:
//   - Anthropic: the newest Sonnet-class Claude model.
//   - OpenAI:    the newest mini-class model.
//   - Gemini:    the newest flash-class model.
//   - Everything else (OpenRouter, local providers): no suggestion.

import type { ModelChoice } from '../../renderer/src/types'

/**
 * Numeric-aware "newest" comparison: compares the VERSION digit sequences
 * embedded in the ids (e.g. claude-sonnet-4-5 > claude-sonnet-4,
 * gpt-4.1-mini > gpt-4o-mini). Eight-digit date stamps (Anthropic's
 * -20250929 suffixes) are excluded from the version compare and used only as
 * a tiebreaker; final ties fall back to reverse-lexicographic order.
 */
function compareNewest(a: string, b: string): number {
  const parse = (s: string): { version: number[]; date: number } => {
    const version: number[] = []
    let date = 0
    for (const token of s.match(/\d+/g) || []) {
      if (token.length === 8) date = Math.max(date, Number(token)) // date stamp
      else version.push(Number(token))
    }
    return { version, date }
  }
  const pa = parse(a)
  const pb = parse(b)
  for (let i = 0; i < Math.max(pa.version.length, pb.version.length); i++) {
    const va = pa.version[i] ?? -1
    const vb = pb.version[i] ?? -1
    if (va !== vb) return vb - va
  }
  if (pa.date !== pb.date) return pb.date - pa.date
  return b.localeCompare(a)
}

function newestMatching(ids: string[], match: (lowerId: string) => boolean): string | null {
  const candidates = ids.filter((id) => match(id.toLowerCase()))
  if (candidates.length === 0) return null
  return [...candidates].sort(compareNewest)[0]
}

/**
 * Pick the model id to tag as "Suggested" for a provider, from the LIVE list of
 * ids. Returns null when no rule applies or no candidate is present.
 */
export function pickSuggestedModelId(provider: string, ids: string[]): string | null {
  switch (provider) {
    case 'anthropic':
      return newestMatching(ids, (id) => id.includes('sonnet'))
    case 'openai':
      return newestMatching(ids, (id) => id.includes('mini'))
    case 'gemini':
      return newestMatching(ids, (id) => id.includes('flash'))
    default:
      return null
  }
}

/** Apply the Suggested tag to the picked model (if any); other entries untouched. */
export function applySuggestedTag(provider: string, models: ModelChoice[]): ModelChoice[] {
  const suggestedId = pickSuggestedModelId(provider, models.map((m) => m.id))
  if (!suggestedId) return models
  return models.map((m) => (m.id === suggestedId ? { ...m, suggested: true } : m))
}
