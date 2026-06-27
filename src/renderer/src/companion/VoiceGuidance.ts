// VoiceGuidance.ts
// Audio playback for the Buildy companion.
// Two sources, ONE queue:
//   1. ElevenLabs: base64 MP3 from main → HTMLAudioElement   (kind: 'audio')
//   2. System TTS fallback: Web Speech API                   (kind: 'tts')
//
// ─── ROOT-CAUSE DIAGNOSIS (voice cut off / skipped ahead — recurred 4+ times) ──
// The serial queue + lock added in previous fixes ONLY governed the ElevenLabs
// path (playAudio). The system-TTS fallback (speakSystemTTS → speakNow) ran
// entirely OUTSIDE the queue and lock, and speakNow() called
// window.speechSynthesis.cancel() at the top of EVERY utterance. So whenever
// voice went through Web Speech — which is the DEFAULT, since defaultSettings()
// ships with an empty elevenLabsApiKey — each newly arriving analysis cancelled
// the still-speaking previous utterance MID-SENTENCE. That was the persistent
// cut-off. Secondarily, because the two paths shared no lock, a fallback TTS
// utterance could also start ON TOP OF a still-playing ElevenLabs clip (overlap
// = "skips ahead"). Every prior fix hardened only the ElevenLabs HTMLAudio path,
// so the most common path (system TTS) kept cutting itself off.
//
// THE FIX (this file): both sources go through ONE queue and ONE lock. Items are
// played strictly one at a time. The lock is released ONLY inside done(), which
// is reached from: audio 'ended'/'error', utterance 'end'/'error', the per-clip
// safety timeout, or stopAllAudio (via finishCurrent). speechSynthesis.cancel()
// is now called ONLY from stopAllAudio — never per-utterance. New analysis NEVER
// interrupts; it only appends to the queue.

let currentAudio: HTMLAudioElement | null = null
let audioLock = false                                      // true while a clip is actively playing
let finishCurrent: ((reason: string) => void) | null = null // settles + unlocks the in-flight clip

// True serial queue: new arrivals APPEND and wait their turn — the currently
// playing clip is never interrupted. Capped so a backlog can't pile up.
type QueueItem =
  | { kind: 'audio'; audioBase64: string; text: string; resolve: () => void }
  | { kind: 'tts'; text: string; resolve: () => void }
const audioQueue: QueueItem[] = []
const MAX_QUEUE = 3

// ─── Speech deduplication ─────────────────────────────────────────────────────
// Stops the same guidance being spoken over and over. A clip is skipped if its
// full constructed text matches the last thing actually spoken AND that was
// within the cooldown. lastSpokenText is recorded only once playback STARTS, so a
// failed clip never blocks the legitimate next one.
let lastSpokenText: string = ''
let lastSpokenAt: number = 0
const SPEAK_COOLDOWN_MS = 90_000
const CLIP_SAFETY_MS = 90_000

function isDuplicate(text: string): boolean {
  return !!text && text === lastSpokenText && Date.now() - lastSpokenAt < SPEAK_COOLDOWN_MS
}

function recordSpoken(text: string): void {
  lastSpokenText = text
  lastSpokenAt = Date.now()
}

/**
 * Clear dedup state so a fresh watching session can speak anything again.
 */
export function resetSpeechDedup(): void {
  lastSpokenText = ''
  lastSpokenAt = 0
  console.log('[Voice] resetSpeechDedup: cleared')
}

// ─── Unified serial queue (both ElevenLabs and system TTS) ────────────────────

/**
 * Shared enqueue path for both audio sources. Dedup, back-to-back guard, append,
 * cap, then pump. Returns true if the item was queued, false if skipped.
 */
function enqueue(item: QueueItem): boolean {
  const trimmed = item.text.trim()
  if (!trimmed) { item.resolve(); return false }
  item.text = trimmed

  // Dedup: skip an exact repeat of the last spoken text within the cooldown.
  if (isDuplicate(trimmed)) {
    console.log(`[Voice] Skipped (dedup): ${trimmed.slice(0, 60)}`)
    item.resolve()
    return false
  }
  // Don't enqueue the identical text twice back-to-back (covers rapid repeats
  // that arrive before the first has started playing / recorded dedup state).
  const tail = audioQueue[audioQueue.length - 1]
  if (tail && tail.text === trimmed) {
    console.log(`[Voice] Skipped (already queued): ${trimmed.slice(0, 60)}`)
    item.resolve()
    return false
  }

  console.log(`[Voice] Queue size before append: ${audioQueue.length}`)
  audioQueue.push(item)
  console.log(`[Voice] Queueing: ${trimmed.slice(0, 60)}`)

  // Cap the queue — drop the OLDEST waiting clip (never the one playing).
  while (audioQueue.length > MAX_QUEUE) {
    const dropped = audioQueue.shift()!
    console.log(`[Voice] Queue dropped (full): ${dropped.text.slice(0, 60)}`)
    dropped.resolve()
  }
  console.log(`[Voice] Queue size after append: ${audioQueue.length}`)

  pumpQueue()
  return true
}

/**
 * Queue base64 MP3 audio (ElevenLabs) for playback. Playback is fully serial: the
 * clip already playing always finishes before the next begins. New arrivals are
 * appended (never substituted), so explanations are read completely and in order.
 */
export function playAudio(audioBase64: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    enqueue({ kind: 'audio', audioBase64, text: text || '', resolve })
  })
}

/** Start the next queued item if nothing is currently playing. */
function pumpQueue(): void {
  if (audioLock) return
  const next = audioQueue.shift()
  if (!next) return
  if (next.kind === 'audio') startAudioPlayback(next)
  else startTtsPlayback(next)
}

/**
 * Build the shared lifecycle for one queued item: a single-shot done() that
 * releases the lock and advances the queue, plus a safety timer. The lock is
 * released ONLY through this done().
 */
function beginItem(
  item: QueueItem,
  onTimeout: () => void
): { done: (reason: string) => void; markSettled: () => boolean } {
  audioLock = true
  let settled = false
  let safetyTimer: ReturnType<typeof setTimeout> | null = null
  const startedAt = Date.now()
  console.log(`[Voice] Acquiring lock — currentText: ${item.text.slice(0, 60)}`)

  const done = (reason: string): void => {
    if (settled) return
    settled = true
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
    finishCurrent = null
    cleanupAudio()
    audioLock = false
    const secs = ((Date.now() - startedAt) / 1000).toFixed(1)
    console.log(`[Voice] Playback duration: ${secs}s`)
    console.log(`[Voice] Releasing lock — reason: ${reason}`)
    item.resolve()
    pumpQueue()
  }

  finishCurrent = (reason: string) => done(reason || 'stop')
  safetyTimer = setTimeout(() => {
    console.warn(`[Voice] safety timeout (${CLIP_SAFETY_MS / 1000}s) — forcing end`)
    onTimeout()
    done('timeout')
  }, CLIP_SAFETY_MS)

  return { done, markSettled: () => settled }
}

/** ElevenLabs MP3 clip via HTMLAudioElement. Advances on the 'ended' event. */
function startAudioPlayback(item: Extract<QueueItem, { kind: 'audio' }>): void {
  const { done, markSettled } = beginItem(item, () => {
    try { currentAudio?.pause() } catch { /* ignore */ }
  })

  try {
    // Data URI avoids blob URL CSP issues in Electron.
    const dataUri = `data:audio/mpeg;base64,${item.audioBase64}`

    // Module-level variable so the GC cannot reclaim it mid-playback.
    const audio = new Audio()
    audio.preload = 'auto'    // buffer the whole clip before playing
    audio.volume = 1.0
    currentAudio = audio

    // Resolve ONLY on a natural end — never on 'play' — so a clip is read fully.
    audio.onended = () => { console.log('[Voice] ended event fired'); done('ended') }
    audio.onerror = (e) => { console.error('[Voice] playback ERROR:', e); done('error') }

    // Only start once the full clip is buffered — prevents playback cutting off.
    audio.oncanplaythrough = () => {
      if (markSettled()) return
      console.log('[Voice] canplaythrough fired, calling play()')
      audio.play().then(() => {
        console.log(`[Voice] play() resolved, awaiting ended... — Playing: ${item.text.slice(0, 60)}`)
        recordSpoken(item.text) // record dedup only once playback actually started
      }).catch((err) => {
        console.error('[Voice] .play() rejected:', err)
        done('play-rejected')
      })
    }

    console.log('[Voice] Audio src set, awaiting canplaythrough...')
    audio.src = dataUri
    audio.load()
  } catch (err) {
    console.error('[Voice] decode error:', err)
    done('decode-error')
  }
}

/** System TTS clip via Web Speech. Advances on the utterance 'end' event. */
function startTtsPlayback(item: Extract<QueueItem, { kind: 'tts' }>): void {
  const { done } = beginItem(item, () => {
    // Stuck utterance — cancel it so the synth engine is free for the next clip.
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  })

  if (!('speechSynthesis' in window)) {
    console.error('[Voice] speechSynthesis not available')
    done('no-tts')
    return
  }
  if (!voicesLoaded) loadBestVoice()

  const utterance = new SpeechSynthesisUtterance(item.text)
  utterance.rate = 0.95
  utterance.pitch = 1.05
  utterance.volume = 1.0
  if (selectedVoice) utterance.voice = selectedVoice

  utterance.onstart = () => {
    console.log(`[Voice] play() resolved, awaiting ended... — Playing: ${item.text.slice(0, 60)}`)
    recordSpoken(item.text)
  }
  utterance.onend = () => { console.log('[Voice] ended event fired'); done('ended') }
  utterance.onerror = (e) => { console.error('[Voice] TTS error:', e.error); done('error') }

  // NOTE: deliberately NO speechSynthesis.cancel() here — cancelling is what cut
  // off the previous utterance. Cancel happens only in stopAllAudio.
  console.log('[Voice] Audio src set, awaiting canplaythrough... (system TTS)')
  window.speechSynthesis.speak(utterance)
}

// ─── System TTS fallback ─────────────────────────────────────────────────────

let selectedVoice: SpeechSynthesisVoice | null = null
let voicesLoaded = false

function loadBestVoice(): void {
  if (!('speechSynthesis' in window)) return
  const voices = window.speechSynthesis.getVoices()
  if (voices.length === 0) return
  voicesLoaded = true
  console.log(`[Voice] loadBestVoice: ${voices.length} voices available`)

  const englishVoices = voices.filter((v) => v.lang.startsWith('en'))
  if (englishVoices.length === 0) { selectedVoice = voices[0]; return }

  const naturalOnline = englishVoices.find(
    (v) => v.name.includes('Online') && v.name.includes('Natural')
  )
  if (naturalOnline) { selectedVoice = naturalOnline; console.log(`[Voice] Selected: ${naturalOnline.name}`); return }
  const anyNatural = englishVoices.find((v) => v.name.includes('Natural'))
  if (anyNatural) { selectedVoice = anyNatural; console.log(`[Voice] Selected: ${anyNatural.name}`); return }
  const macPremium = englishVoices.find(
    (v) => v.name.includes('Samantha') || v.name.includes('Karen') || v.name.includes('Daniel')
  )
  if (macPremium) { selectedVoice = macPremium; console.log(`[Voice] Selected: ${macPremium.name}`); return }
  selectedVoice = englishVoices.find((v) => v.lang === 'en-US') || englishVoices[0]
  console.log(`[Voice] Selected: ${selectedVoice?.name || 'none'}`)
}

if ('speechSynthesis' in window) {
  loadBestVoice()
  window.speechSynthesis.onvoiceschanged = loadBestVoice
}

/**
 * Queue a system-TTS (Web Speech) clip. Goes through the SAME queue/lock as the
 * ElevenLabs path, so it never overlaps or cancels a clip already speaking.
 */
export function speakSystemTTS(text: string): void {
  if (!('speechSynthesis' in window)) {
    console.error('[Voice] speakSystemTTS: speechSynthesis not available')
    return
  }
  enqueue({ kind: 'tts', text: text || '', resolve: () => {} })
}

// ─── Stop everything ─────────────────────────────────────────────────────────

export function stopAllAudio(): void {
  console.log(`[Voice] stopAllAudio — draining queue (${audioQueue.length}) and stopping current`)

  // Clear the whole queue so nothing auto-plays after we stop (resolve each
  // waiting promise so callers awaiting playAudio don't hang).
  while (audioQueue.length) {
    const item = audioQueue.shift()!
    item.resolve()
  }

  // Stop whichever source is in flight.
  if (currentAudio) {
    currentAudio.pause()
    try { currentAudio.currentTime = 0 } catch { /* ignore */ }
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }

  // Release the lock + settle the in-flight promise via the single done() path.
  if (finishCurrent) {
    finishCurrent('stop')
  } else {
    audioLock = false
    cleanupAudio()
  }

  // Reset dedup so the next watching session can speak freely.
  resetSpeechDedup()
}

export function isPlaying(): boolean {
  if (audioLock) return true
  if (currentAudio && !currentAudio.paused) return true
  if ('speechSynthesis' in window && window.speechSynthesis.speaking) return true
  return false
}

function cleanupAudio(): void {
  if (currentAudio) {
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio.oncanplaythrough = null
  }
  currentAudio = null
}

// ─── Speech text formatting ─────────────────────────────────────────────────

export function formatSpokenGuidance(
  whatHappened: string,
  bestNextMove: string,
  changeType: string | null
): string {
  const happened = shorten(whatHappened, 55)
  const nextMove = shorten(bestNextMove, 55)

  let opener = ''
  switch (changeType) {
    case 'completion': opener = 'Nice! '; break
    case 'blocker': opener = 'Heads up. '; break
    case 'error': opener = 'Uh oh. '; break
    default: opener = ''
  }

  if (happened && nextMove) return `${opener}${happened}. Next, ${lowercaseFirst(nextMove)}.`
  if (nextMove) return `${opener}Next, ${lowercaseFirst(nextMove)}.`
  if (happened) return `${opener}${happened}.`
  return ''
}

function shorten(text: string, max: number): string {
  if (!text) return ''
  const c = text.replace(/\s+/g, ' ').trim()
  if (c.length <= max) return c
  const cut = c.lastIndexOf(' ', max)
  return c.slice(0, cut > 0 ? cut : max)
}

function lowercaseFirst(t: string): string {
  return t ? t.charAt(0).toLowerCase() + t.slice(1) : ''
}
