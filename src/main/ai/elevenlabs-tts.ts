// elevenlabs-tts.ts — main process
// Calls the ElevenLabs text-to-speech API and returns raw MP3 audio.
// The audio is sent to the companion renderer via IPC for playback.
//
// API: POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}
// Returns: audio/mpeg binary
//
// Voice settings tuned for a warm, supportive builder buddy:
//   - stability: 0.5 (natural variation, not monotone)
//   - similarity_boost: 0.75 (close to the voice but not rigid)
//   - style: 0.4 (some expressiveness)
//   - use_speaker_boost: true

import { fetchWithTimeout } from './fetch-with-timeout'

const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const TTS_MAX_CHARS = 300

/**
 * Clean text before sending to TTS: strip markdown / control markers that would
 * otherwise be read aloud or cause choppy synthesis, and cap the length so
 * playback stays short and smooth.
 */
function sanitizeForTTS(raw: string): string {
  let t = raw
    .replace(/\[PROMPT_START\]|\[PROMPT_END\]/g, '') // control markers
    .replace(/\*\*/g, '')                            // bold markers
    .replace(/#{1,6}/g, '')                          // markdown headings (##, ###, ...)
    .replace(/`+/g, '')                              // code ticks
    .replace(/\s+/g, ' ')
    .trim()

  if (t.length > TTS_MAX_CHARS) {
    const cut = t.lastIndexOf(' ', TTS_MAX_CHARS)
    t = t.slice(0, cut > 0 ? cut : TTS_MAX_CHARS).trim()
  }
  return t
}

export interface ElevenLabsTTSResult {
  success: boolean
  audioBase64: string | null  // MP3 audio as base64 string
  error: string | null
}

/**
 * Convert text to speech using ElevenLabs.
 * Returns base64-encoded MP3 audio on success, or an error message on failure.
 */
export async function synthesizeSpeech(
  text: string,
  apiKey: string,
  voiceId: string
): Promise<ElevenLabsTTSResult> {
  if (!apiKey) {
    console.log('[ElevenLabs] No API key configured — skipping')
    return { success: false, audioBase64: null, error: 'No ElevenLabs API key configured' }
  }

  const cleanText = sanitizeForTTS(text)
  if (!cleanText) {
    return { success: false, audioBase64: null, error: 'Empty text' }
  }

  console.log(`[ElevenLabs] TTS request: "${cleanText.slice(0, 60)}..." (${cleanText.length} chars) voice=${voiceId}`)

  try {
    const response = await fetchWithTimeout(
      `${ELEVENLABS_BASE}/text-to-speech/${voiceId}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: cleanText,
          // Streaming-friendly turbo model for faster, smoother playback
          model_id: 'eleven_turbo_v2_5',
          voice_settings: {
            stability: 0.65,
            similarity_boost: 0.80,
            style: 0.15,
            use_speaker_boost: true,
          },
        }),
      }
    )

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      console.error(`[ElevenLabs] TTS failed: ${response.status} ${errorBody.slice(0, 200)}`)
      return {
        success: false,
        audioBase64: null,
        error: `ElevenLabs error ${response.status}: ${errorBody.slice(0, 200)}`,
      }
    }

    const audioBuffer = await response.arrayBuffer()
    const audioBase64 = Buffer.from(audioBuffer).toString('base64')
    console.log(`[ElevenLabs] TTS success: ${audioBase64.length} chars of base64 audio`)

    return { success: true, audioBase64, error: null }
  } catch (error) {
    console.error(`[ElevenLabs] TTS exception: ${error}`)
    return {
      success: false,
      audioBase64: null,
      error: `ElevenLabs TTS failed: ${String(error).slice(0, 200)}`,
    }
  }
}
