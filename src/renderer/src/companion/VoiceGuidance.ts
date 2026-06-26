// VoiceGuidance.ts
// Audio playback for the Buildy companion.
// Two modes:
//   1. ElevenLabs: receives base64 MP3 from main process, plays via HTMLAudioElement
//   2. System TTS fallback: Web Speech API
//
// All paths log clearly. No silent failures.

let currentAudio: HTMLAudioElement | null = null
let audioLock = false                                                       // true while a clip is actively playing
let queuedAudio: { audioBase64: string; resolve: () => void } | null = null // at most ONE clip waiting
let finishCurrent: (() => void) | null = null                               // resolves + unlocks the in-flight clip

// ─── Speech deduplication ─────────────────────────────────────────────────────
// Stops the same guidance being spoken over and over. The same text is skipped
// while it is still the most recent thing said AND it was said within the cooldown.
let lastSpokenText: string = ''
let lastSpokenAt: number = 0
const SPEAK_COOLDOWN_MS = 60_000

/**
 * Decide whether `text` should be spoken now. Returns false (skip) for empty text
 * and for an exact repeat of the last spoken text within the cooldown window.
 * Records the text + timestamp when it is allowed through.
 */
function shouldSpeak(text: string): boolean {
  const trimmed = (text || '').trim()
  if (!trimmed) {
    console.log('[Voice] shouldSpeak: empty text — skipping')
    return false
  }
  if (trimmed === lastSpokenText && Date.now() - lastSpokenAt < SPEAK_COOLDOWN_MS) {
    console.log('[Voice] shouldSpeak: duplicate within cooldown — skipping')
    return false
  }
  lastSpokenText = trimmed
  lastSpokenAt = Date.now()
  return true
}

/**
 * Clear dedup state so a fresh watching session can speak anything again.
 */
export function resetSpeechDedup(): void {
  lastSpokenText = ''
  lastSpokenAt = 0
  console.log('[Voice] resetSpeechDedup: cleared')
}

// ─── ElevenLabs audio playback ───────────────────────────────────────────────

/**
 * Play base64 MP3 audio. Playback is serialized so new TTS never interrupts the
 * clip already playing (which caused the choppy / cut-off voice). If audio is
 * busy, the new clip is queued; the queue holds at most one clip, so when a third
 * clip arrives the stale middle one is dropped and only the latest plays. The
 * lock is always released — on natural end, on error, or on a failed .play().
 */
export function playAudio(audioBase64: string, text: string): Promise<void> {
  return new Promise((resolve) => {
    console.log(`[Voice] playAudio: received ${audioBase64.length} chars of base64`)

    // Deduplicate: skip repeats of the same spoken content (see shouldSpeak)
    if (!shouldSpeak(text)) {
      resolve()
      return
    }

    if (audioLock) {
      // Already playing — queue the latest, dropping any stale queued clip (cap = 1)
      if (queuedAudio) {
        console.log('[Voice] playAudio: dropping stale queued clip, keeping latest')
        queuedAudio.resolve()
      }
      console.log('[Voice] playAudio: audio busy — queuing this clip')
      queuedAudio = { audioBase64, resolve }
      return
    }

    startPlayback(audioBase64, resolve)
  })
}

function startPlayback(audioBase64: string, resolve: () => void): void {
  audioLock = true
  let settled = false
  let safetyTimer: ReturnType<typeof setTimeout> | null = null

  // Release the lock exactly once, then play the next queued clip if there is one.
  const done = (reason: string): void => {
    if (settled) return
    settled = true
    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null }
    finishCurrent = null
    cleanupAudio()
    audioLock = false
    console.log(`[Voice] playAudio: LOCK RELEASED (${reason})`)
    resolve()
    if (queuedAudio) {
      const next = queuedAudio
      queuedAudio = null
      startPlayback(next.audioBase64, next.resolve)
    }
  }
  finishCurrent = () => done('stopped')

  try {
    // Use data URI directly — avoids blob URL CSP issues in Electron
    const dataUri = `data:audio/mpeg;base64,${audioBase64}`

    // Keep the element on a module-level variable (assigned below) so the garbage
    // collector cannot reclaim it mid-playback and cut the audio off.
    const audio = new Audio()
    audio.preload = 'auto'    // buffer the whole clip before playing
    audio.volume = 1.0
    currentAudio = audio

    audio.onended = () => {
      console.log('[Voice] playAudio: playback ENDED')
      done('ended')
    }
    audio.onerror = (e) => {
      console.error('[Voice] playAudio: playback ERROR:', e)
      done('error')
    }

    // Only start once the full clip is buffered — prevents playback cutting off
    audio.oncanplaythrough = () => {
      if (settled) return
      console.log('[Voice] playAudio: canplaythrough — STARTING playback')
      audio.play().then(() => {
        console.log('[Voice] playAudio: playback started successfully')
      }).catch((err) => {
        console.error('[Voice] playAudio: .play() rejected:', err)
        done('play-rejected')
      })
    }

    // Safety net: if a clip never ends (stuck buffering or >60s), force-release the lock
    safetyTimer = setTimeout(() => {
      console.warn('[Voice] playAudio: safety timeout (60s) — forcing end')
      try { audio.pause() } catch { /* ignore */ }
      done('timeout')
    }, 60_000)

    audio.src = dataUri
    audio.load()
  } catch (err) {
    console.error('[Voice] playAudio: decode error:', err)
    done('decode-error')
  }
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

export function speakSystemTTS(text: string): void {
  if (!('speechSynthesis' in window)) {
    console.error('[Voice] speakSystemTTS: speechSynthesis not available')
    return
  }

  // Deduplicate before speaking (the retry path uses speakNow, which bypasses this)
  if (!shouldSpeak(text)) return

  console.log(`[Voice] speakSystemTTS: "${text.slice(0, 60)}..."`)
  speakNow(text)
}

function speakNow(text: string): void {
  window.speechSynthesis.cancel()
  if (!voicesLoaded) loadBestVoice()

  if (!voicesLoaded) {
    console.warn('[Voice] speakSystemTTS: no voices loaded yet, retrying in 500ms')
    setTimeout(() => speakNow(text), 500)
    return
  }

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1.05
  utterance.volume = 0.8
  if (selectedVoice) utterance.voice = selectedVoice

  utterance.onstart = () => console.log('[Voice] speakSystemTTS: speech started')
  utterance.onend = () => console.log('[Voice] speakSystemTTS: speech ended')
  utterance.onerror = (e) => console.error('[Voice] speakSystemTTS: error:', e.error)

  window.speechSynthesis.speak(utterance)
  console.log('[Voice] speakSystemTTS: utterance queued')
}

// ─── Stop everything ─────────────────────────────────────────────────────────

export function stopAllAudio(): void {
  // Drop any queued clip so it doesn't auto-play after we stop
  if (queuedAudio) { queuedAudio.resolve(); queuedAudio = null }

  // Stop the in-flight clip and release its lock + pending promise
  if (currentAudio) {
    currentAudio.pause()
    try { currentAudio.currentTime = 0 } catch { /* ignore */ }
  }
  if (finishCurrent) {
    finishCurrent()
  } else {
    audioLock = false
    cleanupAudio()
  }

  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
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
