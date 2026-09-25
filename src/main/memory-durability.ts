// memory-durability.ts — pure: which text may be kept in project memory.
//
// Project memory keeps DURABLE facts only: features completed, decisions made,
// blockers. What the coding agent is doing at this moment ("currently reading
// the code", "sitting idle", "waiting for a new instruction") is stale within a
// minute; stored, it is fed back to the models as if it were a fact about the
// project. It is never saved, and entries like it are purged on load.

const AGENT = String.raw`(?:claude code|codex|the (?:coding )?agent|the ai|the assistant|the terminal|it)`

const MOMENTARY: RegExp[] = [
  // "currently reading", "right now waiting", "at the moment thinking"
  /\b(currently|right now|at the moment|still)\s+(reading|thinking|working|running|processing|loading|scanning|exploring|looking|reviewing|analy[sz]ing|searching|waiting|idle|sitting|typing)\b/i,
  // "sitting idle", "is idle", "went idle"
  /\b(sitting|is|are|was|remains?|went|gone|now|currently)\s+idle\b/i,
  // "waiting for a new instruction", "awaiting the next prompt"
  /\b(waiting|awaiting)\s+(for|on)?\s*(a |an |the |your |my |further )?(new |next |more |further )?(instruction|instructions|prompt|input|command|reply|response|answer|you|user)\b/i,
  // "Claude Code is reading …", "the agent is now exploring …"
  new RegExp(String.raw`\b${AGENT}\s+(is|are|was|has been)\s+(now\s+|currently\s+|still\s+|just\s+)?(reading|thinking|working|running|processing|loading|scanning|exploring|looking|reviewing|analy[sz]ing|searching|waiting|typing|sitting|paused|stopped)\b`, 'i'),
]

/** True for an observation about the coding agent's momentary state. */
export function isMomentaryState(text: string | null | undefined): boolean {
  if (!text || !text.trim()) return false
  return MOMENTARY.some((re) => re.test(text))
}

/** Minimal shape of a stored memory entry (Nemp's). */
export interface StoredMemory {
  value: string
  tags: string[]
}

/**
 * True for a stored MyBuildy entry that must be purged: any entry whose text is
 * momentary agent state, and every per-analysis screen observation (tagged
 * "analysis:<id>") — the "what is happening right now" line of one analysis.
 */
export function isPurgeable(m: StoredMemory, ownTag: string): boolean {
  if (!m.tags.includes(ownTag)) return false // never touch other tools' memories
  if (isMomentaryState(m.value)) return true
  return m.tags.includes('observation') && m.tags.some((t) => t.startsWith('analysis:'))
}
