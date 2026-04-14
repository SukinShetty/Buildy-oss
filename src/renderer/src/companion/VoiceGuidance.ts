// VoiceGuidance.ts
// Audio playback for the Buildy companion.
// Two modes:
//   1. ElevenLabs: receives base64 MP3 from main process, plays via HTMLAudioElement
//   2. System TTS fallback: Web Speech API
//
// All paths log clearly. No silent failures.

let currentAudio: HTMLAudioElement | null = null

// ─── ElevenLabs audio playback ───────────────────────────────────────────────

export function playAudio(audioBase64: string): Promise<void> {
  return new Promise((resolve) => {
    console.log(`[Voice] playAudio: received ${audioBase64.length} chars of base64`)
    stopAllAudio()

    try {
      // Use data URI directly — avoids blob URL CSP issues in Electron
      const dataUri = `data:audio/mpeg;base64,${audioBase64}`

      currentAudio = new Audio(dataUri)
      currentAudio.volume = 0.85

      currentAudio.onended = () => {
        console.log('[Voice] playAudio: playback ended')
        cleanupAudio()
        resolve()
      }
      currentAudio.onerror = (e) => {
        console.error('[Voice] playAudio: playback error:', e)
        cleanupAudio()
        resolve()
      }

      console.log('[Voice] playAudio: calling .play()')
      currentAudio.play().then(() => {
        console.log('[Voice] playAudio: playback started successfully')
      }).catch((err) => {
        console.error('[Voice] playAudio: .play() rejected:', err)
        cleanupAudio()
        resolve()
      })
    } catch (err) {
      console.error('[Voice] playAudio: decode error:', err)
      resolve()
    }
  })
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

  console.log(`[Voice] speakSystemTTS: "${text.slice(0, 60)}..."`)
  window.speechSynthesis.cancel()
  if (!voicesLoaded) loadBestVoice()

  if (!voicesLoaded) {
    console.warn('[Voice] speakSystemTTS: no voices loaded yet, retrying in 500ms')
    setTimeout(() => speakSystemTTS(text), 500)
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
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    cleanupAudio()
  }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel()
  }
}

export function isPlaying(): boolean {
  if (currentAudio && !currentAudio.paused) return true
  if ('speechSynthesis' in window && window.speechSynthesis.speaking) return true
  return false
}

function cleanupAudio(): void {
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
