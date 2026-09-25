// voice-options.ts — the ElevenLabs voices offered in Settings, by NAME. The
// voice ID is stored and sent to ElevenLabs, but never shown to the user.

export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM' // Rachel — warm, conversational

export const ELEVENLABS_VOICES: ReadonlyArray<{ id: string; name: string }> = [
  { id: DEFAULT_VOICE_ID, name: 'Rachel (default)' },
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
  { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni' },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh' },
]

/** Display name for a stored voice ID: a known voice's name, otherwise "Custom voice". */
export function voiceLabel(id: string): string {
  return ELEVENLABS_VOICES.find((v) => v.id === id)?.name ?? 'Custom voice'
}
