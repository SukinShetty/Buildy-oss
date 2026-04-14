// speech-formatter.ts — main process
// Converts analysis data into short, clear, spoken text for live guidance.
//
// Target format:
//   "Right now, [what is happening]. [Next step]."
//   "[What] is done. Next, [do this]."
//   "Heads up. [Problem]. [What to do]."
//
// Rules:
//   - Short: 2 sentences max, under 35 words total
//   - Plain English: no code, no file paths, no brackets
//   - Clear pronunciation: no abbreviations, no compressed wording
//   - Warm and supportive tone

/**
 * Format spoken text for live guidance updates.
 */
export function formatSpokenGuidance(
  whatHappened: string,
  bestNextMove: string,
  changeType: string | null
): string {
  const happened = cleanForSpeech(whatHappened, 60)
  const nextMove = cleanForSpeech(bestNextMove, 50)

  if (!happened && !nextMove) return ''

  switch (changeType) {
    case 'completion':
      if (happened && nextMove) return `${happened}. Next, ${lowFirst(nextMove)}.`
      if (happened) return `${happened}.`
      return `Next, ${lowFirst(nextMove)}.`

    case 'blocker':
    case 'error':
      if (happened && nextMove) return `Heads up. ${happened}. ${nextMove}.`
      if (happened) return `Heads up. ${happened}.`
      return `Heads up. ${nextMove}.`

    case 'new_step':
      if (happened && nextMove) return `Right now, ${lowFirst(happened)}. ${nextMove}.`
      if (happened) return `Right now, ${lowFirst(happened)}.`
      return `${nextMove}.`

    case 'progress':
      if (happened && nextMove) return `${happened}. Next, ${lowFirst(nextMove)}.`
      if (nextMove) return `Next, ${lowFirst(nextMove)}.`
      return `${happened}.`

    default:
      if (happened && nextMove) return `Right now, ${lowFirst(happened)}. ${nextMove}.`
      if (happened) return `${happened}.`
      return `${nextMove}.`
  }
}

/**
 * Clean raw analysis text so it sounds natural when spoken aloud.
 * Removes code, paths, brackets, and technical clutter.
 */
function cleanForSpeech(text: string, maxChars: number): string {
  if (!text) return ''

  let cleaned = text
    // Remove file paths (e.g. src/main/index.ts, ./foo/bar)
    .replace(/[a-zA-Z0-9_./-]+\/[a-zA-Z0-9_./-]+/g, '')
    // Remove backticks and code fences
    .replace(/`[^`]*`/g, '')
    .replace(/```[^]*?```/g, '')
    // Remove brackets and their content if short
    .replace(/\[[^\]]{0,20}\]/g, '')
    .replace(/\{[^}]{0,20}\}/g, '')
    .replace(/\([^)]{0,10}\)/g, '')
    // Remove quotes around single words
    .replace(/"(\w+)"/g, '$1')
    // Remove common code symbols
    .replace(/[{}[\]<>|\\]/g, '')
    // Remove double-dashes
    .replace(/--/g, ' ')
    // Collapse whitespace
    .replace(/\s+/g, ' ')
    .trim()

  // Trim to max length at word boundary
  if (cleaned.length > maxChars) {
    const cut = cleaned.lastIndexOf(' ', maxChars)
    cleaned = cleaned.slice(0, cut > 0 ? cut : maxChars)
  }

  // Remove trailing period (we add our own)
  cleaned = cleaned.replace(/\.\s*$/, '').trim()

  return cleaned
}

function lowFirst(t: string): string {
  if (!t) return ''
  return t.charAt(0).toLowerCase() + t.slice(1)
}
