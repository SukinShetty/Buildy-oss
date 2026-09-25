// answer-suggestion.ts — pure helpers for the goal/prompt box under a spoken
// answer. Shared by main (to build it) and the guidance panel (to copy it).

import type { AnswerSuggestion } from './types'

/** The goal's verifiable check as one line, always starting "Done when". */
export function doneWhenLine(doneWhen: string): string {
  const check = doneWhen.trim().replace(/^done when[:\s]*/i, '').replace(/\s+/g, ' ')
  return `Done when ${check}`
}

/** Exactly what the suggestion's Copy button copies — the suggestion, nothing else. */
export function suggestionCopyText(suggestion: AnswerSuggestion): string {
  const text = suggestion.text.trim()
  if (suggestion.kind === 'goal' && suggestion.doneWhen?.trim()) {
    return `${text}\n${doneWhenLine(suggestion.doneWhen)}`
  }
  return text
}
