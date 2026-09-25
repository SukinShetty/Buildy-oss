// voice-question.ts — recording → transcription → question, carried by one Stop
// generation. The generation is taken when recording STARTS; if Stop is pressed
// at any point after that, every later step is skipped: no upload, no question,
// and (in main) no capture or provider call for it.

export class StopGeneration {
  private value = 0
  current(): number {
    return this.value
  }
  /** Stop pressed: everything started before now is cancelled. */
  bump(): void {
    this.value++
  }
}

export interface VoiceQuestionDeps {
  transcribe(audio: ArrayBuffer): Promise<{ success: boolean; text: string; error?: string }>
  ask(question: string): Promise<void>
  onStatus(status: 'transcribing' | 'answering' | 'idle', error?: string): void
}

export type VoiceQuestionOutcome = 'asked' | 'cancelled' | 'failed'

export async function transcribeAndAsk(
  audio: ArrayBuffer,
  startedAt: number,
  stop: StopGeneration,
  deps: VoiceQuestionDeps
): Promise<VoiceQuestionOutcome> {
  const stopped = (): boolean => stop.current() !== startedAt
  if (stopped()) return 'cancelled'

  deps.onStatus('transcribing')
  const result = await deps.transcribe(audio)
  if (stopped()) return 'cancelled'
  if (!result.success || !result.text) {
    deps.onStatus('idle', result.error || 'Transcription failed.')
    return 'failed'
  }

  deps.onStatus('answering')
  await deps.ask(result.text)
  return 'asked'
}
