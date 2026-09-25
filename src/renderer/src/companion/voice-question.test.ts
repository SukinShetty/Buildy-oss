import { describe, it, expect, vi } from 'vitest'
import { StopGeneration, transcribeAndAsk } from './voice-question'

const audio = new Uint8Array(2048).buffer

describe('voice question flow: Stop cancels every later step', () => {
  it('Stop during transcription → no question is sent', async () => {
    const stop = new StopGeneration()
    let finishTranscription: (v: { success: boolean; text: string }) => void = () => {}
    const deps = {
      transcribe: vi.fn(() => new Promise<{ success: boolean; text: string }>((r) => { finishTranscription = r })),
      ask: vi.fn(async () => {}),
      onStatus: vi.fn(),
    }
    const run = transcribeAndAsk(audio, stop.current(), stop, deps)
    stop.bump() // user presses Stop while the recording is being transcribed
    finishTranscription({ success: true, text: 'What happened in my terminal?' })
    expect(await run).toBe('cancelled')
    expect(deps.ask).not.toHaveBeenCalled()
  })

  it('Stop before transcription starts → nothing is uploaded', async () => {
    const stop = new StopGeneration()
    const started = stop.current()
    stop.bump()
    const deps = { transcribe: vi.fn(), ask: vi.fn(), onStatus: vi.fn() }
    expect(await transcribeAndAsk(audio, started, stop, deps)).toBe('cancelled')
    expect(deps.transcribe).not.toHaveBeenCalled()
    expect(deps.ask).not.toHaveBeenCalled()
  })

  it('without Stop the question is asked once', async () => {
    const stop = new StopGeneration()
    const deps = {
      transcribe: vi.fn(async () => ({ success: true, text: 'What happened?' })),
      ask: vi.fn(async () => {}),
      onStatus: vi.fn(),
    }
    expect(await transcribeAndAsk(audio, stop.current(), stop, deps)).toBe('asked')
    expect(deps.ask).toHaveBeenCalledWith('What happened?')
  })
})
