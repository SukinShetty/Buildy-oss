// VoicePlayer.tsx — renderer for the hidden voice window (?voice=true)
// A DUMB player. It plays exactly one clip when the main process tells it to, and
// reports `ended`/`error` back. ALL queueing/chunking/locking lives in the main
// process (voice-queue.ts), so this window is never the source of truth for timing
// and never interrupts itself. Its BrowserWindow has backgroundThrottling:false,
// so playback survives the companion window being backgrounded.
//
// No visible UI — it renders nothing.

import { useEffect } from 'react'

// Module-level so the element can't be GC'd mid-playback.
let currentAudio: HTMLAudioElement | null = null

function stopCurrent(): void {
  if (currentAudio) {
    try { currentAudio.pause() } catch { /* ignore */ }
    currentAudio.onended = null
    currentAudio.onerror = null
    currentAudio = null
  }
  if ('speechSynthesis' in window) {
    try { window.speechSynthesis.cancel() } catch { /* ignore */ }
  }
}

export function VoicePlayer(): null {
  useEffect(() => {
    console.log('[VoicePlayer-Renderer] mounted (dumb player)')

    const unsubs = [
      window.buildy.voice.onPlayAudio((_, d) => {
        stopCurrent()
        console.log(`[VoicePlayer-Renderer] play-audio ${d.id}`)
        const audio = new Audio(`data:audio/mpeg;base64,${d.audioBase64}`)
        audio.volume = 1.0
        currentAudio = audio
        audio.onended = () => { console.log(`[VoicePlayer-Renderer] ended ${d.id}`); window.buildy.voice.ended(d.id) }
        audio.onerror = () => { console.error(`[VoicePlayer-Renderer] error ${d.id}`); window.buildy.voice.error(d.id) }
        audio.play().catch((err) => {
          console.error('[VoicePlayer-Renderer] play() rejected:', err)
          window.buildy.voice.error(d.id)
        })
      }),

      window.buildy.voice.onPlayTts((_, d) => {
        stopCurrent()
        console.log(`[VoicePlayer-Renderer] play-tts ${d.id}`)
        if (!('speechSynthesis' in window)) { window.buildy.voice.error(d.id); return }
        const utter = new SpeechSynthesisUtterance(d.text)
        utter.rate = 0.95
        utter.pitch = 1.05
        utter.volume = 1.0
        utter.onend = () => { console.log(`[VoicePlayer-Renderer] tts ended ${d.id}`); window.buildy.voice.ended(d.id) }
        utter.onerror = () => { console.error(`[VoicePlayer-Renderer] tts error ${d.id}`); window.buildy.voice.error(d.id) }
        window.speechSynthesis.speak(utter)
      }),

      window.buildy.voice.onStop(() => {
        console.log('[VoicePlayer-Renderer] stop')
        stopCurrent()
      }),
    ]

    return () => { unsubs.forEach((u) => u()); stopCurrent() }
  }, [])

  return null
}
