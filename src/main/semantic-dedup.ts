// semantic-dedup.ts — main process (ELECTRON-FREE, unit-tested)
// Catches NEAR-duplicate facts that exact-string dedup misses — e.g. these were
// all spoken within ~3.5 min and all mean the same thing (6 models installed):
//   "All 6 AI models fully downloaded and installed is done…"
//   "All 6 target AI models fully installed with no incomplete downloads is done…"
//   "All 6 AI models confirmed installed (qwen3:1.7b…) is done…"
//
// Approach (dependency-free):
//   1. Normalize: lowercase, strip punctuation, drop filler/stopwords (incl. the
//      ones called out: is/done/fully/confirmed/target/all/with/no/incomplete/
//      downloads…), leaving the core nouns/numbers/verbs ("6 ai models installed").
//   2. Compare two normalized token sets by Jaccard similarity (> 0.6 ⇒ duplicate)
//      OR containment (every meaningful token of the shorter set is in the longer
//      ⇒ duplicate) so "6 models installed" matches "6 models installed qwen3 1.7b".
//   3. RecentTopics tracks the last N spoken topics with timestamps and only
//      treats something as a duplicate within a time window (default 3 min).

const FILLER = new Set([
  // grammatical stopwords
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'am',
  'of', 'to', 'and', 'or', 'with', 'no', 'not', 'now', 'just', 'for', 'on', 'in',
  'at', 'it', 'its', 'this', 'that', 'these', 'those', 'your', 'you', 'has', 'have',
  'had', 'into', 'then', 'so', 'but', 'as', 'by', 'from', 'up', 'out', 'will',
  // domain filler called out in the brief
  'all', 'target', 'targets', 'fully', 'full', 'done', 'confirmed', 'complete',
  'completed', 'completely', 'successfully', 'successful', 'incomplete',
  'download', 'downloads', 'downloaded',
])

/** Normalize text to its meaningful core tokens. */
export function normalizeTokens(text: string): string[] {
  return (text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => !FILLER.has(t))
    // keep multi-char words and any pure number (so "6" survives)
    .filter((t) => t.length >= 2 || /^[0-9]+$/.test(t))
}

/** Core comparison on two pre-computed token sets. */
function dupTokenSets(ta: Set<string>, tb: Set<string>, threshold: number): boolean {
  if (!ta.size || !tb.size) return false
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  const union = ta.size + tb.size - inter
  if (union > 0 && inter / union > threshold) return true
  // Containment: every meaningful token of the smaller set is in the larger.
  const [small, large] = ta.size <= tb.size ? [ta, tb] : [tb, ta]
  if (small.size >= 2) {
    for (const t of small) if (!large.has(t)) return false
    return true
  }
  return false
}

/** True if `a` and `b` describe substantially the same thing. */
export function isSemanticDuplicate(a: string, b: string, threshold = 0.6): boolean {
  return dupTokenSets(new Set(normalizeTokens(a)), new Set(normalizeTokens(b)), threshold)
}

/** A compact normalized key for logging / coarse keying. */
export function subjectKey(text: string): string {
  return normalizeTokens(text).sort().join('-').slice(0, 60) || 'empty'
}

interface Topic { tokens: Set<string>; raw: string; at: number }

/**
 * Tracks recently-spoken topics and flags near-duplicates within a time window.
 * After the window elapses the same fact MAY be spoken again.
 */
export class RecentTopics {
  private items: Topic[] = []
  constructor(
    private readonly windowMs = 180_000, // 3 minutes
    private readonly max = 10,
    private readonly threshold = 0.6
  ) {}

  isDuplicate(text: string, now: number): boolean {
    this.prune(now)
    const t = new Set(normalizeTokens(text))
    if (!t.size) return false
    return this.items.some((it) => dupTokenSets(t, it.tokens, this.threshold))
  }

  record(text: string, now: number): void {
    this.items.push({ tokens: new Set(normalizeTokens(text)), raw: text, at: now })
    while (this.items.length > this.max) this.items.shift()
  }

  clear(): void {
    this.items = []
  }

  private prune(now: number): void {
    this.items = this.items.filter((it) => now - it.at < this.windowMs)
  }
}
