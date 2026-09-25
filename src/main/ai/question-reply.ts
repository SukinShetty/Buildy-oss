// question-reply.ts — pure: turn the model's reply to a spoken question into
// the conversational answer plus, when the user asked for one, a separate goal
// or prompt suggestion (shown in its own box with its own Copy button).
//
// Rules enforced here, whatever the model sends:
//   - The suggestion is its OWN field. It is never left inside the reply — not
//     quoted, not verbatim; the reply points to it instead ("the goal below").
//   - A goal is written as a goal: what to build plus a verifiable "Done when …"
//     check. A goal with no check is not shown as a goal.
//   - Anything unparseable is treated as a plain reply with no suggestion.

import type { AnswerSuggestion } from '../../renderer/src/types'

export interface ParsedQuestionReply {
  reply: string
  suggestion?: AnswerSuggestion
}

const MIN_QUOTED_SUGGESTION = 20 // shorter quoted bits ("Settings", "npm test") are ordinary words

function extractJson(raw: string): Record<string, unknown> | null {
  const text = raw.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return null
  try {
    const parsed = JSON.parse(text.slice(start, end + 1)) as unknown
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

function parseSuggestion(value: unknown): AnswerSuggestion | undefined {
  if (!value || typeof value !== 'object') return undefined
  const v = value as Record<string, unknown>
  const kind = v['kind'] === 'goal' || v['kind'] === 'prompt' ? v['kind'] : null
  let text = str(v['text'])
  if (!kind || !text) return undefined
  if (kind === 'prompt') return { kind, text }

  // Goal: the check may come as its own field or as a "Done when" line in the text.
  let doneWhen = str(v['doneWhen'])
  const inline = /\n?\s*done when[:\s]+([\s\S]+)$/i.exec(text)
  if (inline) {
    if (!doneWhen) doneWhen = inline[1].trim()
    text = text.slice(0, inline.index).trim()
  }
  doneWhen = doneWhen.replace(/^done when[:\s]*/i, '').trim()
  if (!text || !doneWhen) return undefined // not a goal without a verifiable check
  return { kind, text, doneWhen }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Take the suggestion out of the reply: quoted passages and verbatim copies. */
function withoutSuggestion(reply: string, suggestion: AnswerSuggestion): string {
  const pointer = suggestion.kind === 'goal' ? 'the goal below' : 'the prompt below'
  let out = reply
  // Any long quoted passage is the suggestion embedded in a sentence.
  out = out.replace(new RegExp(`["“”][^"“”]{${MIN_QUOTED_SUGGESTION},}["“”]`, 'g'), pointer)
  out = out.replace(new RegExp(`(^|\\s)['‘][^'’]{${MIN_QUOTED_SUGGESTION},}['’](?=[\\s.,;:!?]|$)`, 'g'), `$1${pointer}`)
  for (const part of [suggestion.text, suggestion.doneWhen || '']) {
    if (part.length >= MIN_QUOTED_SUGGESTION) out = out.replace(new RegExp(escapeRegExp(part), 'gi'), pointer)
  }
  out = out.replace(/\s+/g, ' ').trim()
  return out
}

const SORRY = "Sorry, I couldn't answer that. Try asking again."

/** A reply cut off mid-JSON (token limit): keep its "reply" string if it is complete. */
function salvageReply(raw: string): string {
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(raw)
  if (!m) return SORRY
  try { return (JSON.parse(`"${m[1]}"`) as string).trim() || SORRY } catch { return SORRY }
}

export function parseQuestionReply(raw: string): ParsedQuestionReply {
  const json = extractJson(raw)
  if (!json) return { reply: raw.trim().startsWith('{') ? salvageReply(raw) : raw.trim() }

  const suggestion = parseSuggestion(json['suggestion'])
  let reply = str(json['reply']) || str(json['answer'])
  if (suggestion) {
    reply = withoutSuggestion(reply, suggestion)
    if (!reply) reply = suggestion.kind === 'goal' ? "Here's a goal you can use." : "Here's a prompt you can give the agent."
  }
  if (!reply) return { reply: SORRY } // never show raw JSON
  return suggestion ? { reply, suggestion } : { reply }
}
