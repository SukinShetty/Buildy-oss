// speech-formatter.ts — main process
// Converts analysis data into clear, spoken text for live guidance.
//
// Target format:
//   "Right now, [what is happening]. [Next step]."
//   "[What] is done. Next, [do this]."
//   "Heads up. [Problem]. [What to do]."
//
// Rules:
//   - Plain English: no code, no file paths, no brackets
//   - Clear pronunciation: no abbreviations, no compressed wording
//   - Warm and supportive tone
//   - COMPLETE sentences. This formatter does NOT truncate — the voice player's
//     sentence-safe chunker (splitIntoChunks) handles length by splitting long
//     text into chunks played in sequence. Truncating here (the old 60/50-char
//     caps) cut sentences mid-word and was the real cause of the "voice cutoff"
//     bug: the audio played its text fully, but the text was already a fragment.

/**
 * Format spoken text for live guidance updates. Sends the FULL cleaned text — no
 * length capping — so the spoken content matches what the GuidancePanel displays.
 */
export function formatSpokenGuidance(
  whatHappened: string,
  bestNextMove: string,
  changeType: string | null
): string {
  const happened = cleanForSpeech(whatHappened)
  const nextMove = cleanForSpeech(bestNextMove)

  if (!happened && !nextMove) return ''

  switch (changeType) {
    case 'completion':
      // Natural completion phrasing — no clunky "<X> is done. Next, just wait".
      if (happened && nextMove) return `Good news. ${happened}. ${nextMove}.`
      if (happened) return `Good news. ${happened}.`
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
 * Removes code, paths, brackets, and technical clutter. Does NOT truncate —
 * complete sentences are preserved in full.
 */
function cleanForSpeech(text: string): string {
  if (!text) return ''

  const cleaned = text
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

  // Remove a single trailing period (the caller adds its own). NOTE: no length
  // capping — long text is handled by the voice player's sentence-safe chunker.
  return cleaned.replace(/\.\s*$/, '').trim()
}

function lowFirst(t: string): string {
  if (!t) return ''
  return t.charAt(0).toLowerCase() + t.slice(1)
}
