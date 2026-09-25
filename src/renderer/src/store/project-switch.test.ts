// A normal project switch must not carry the brainstorm conversation, its
// extracted project data, or the last analysis into the next project.
import { describe, it, expect } from 'vitest'
import { useAppStore } from './useAppStore'

describe('project switch resets per-project renderer state', () => {
  it('clears brainstorm history, extracted data and the cached analysis', () => {
    const s = useAppStore.getState()
    s.addBrainstormUserMessage('Plan a recipe box for project A')
    s.appendBrainstormStreamChunk('Sure — for project A you could…')
    s.finalizeBrainstormAssistantMessage('Sure — for project A you could…', {
      projectName: 'Recipe box', productSummary: 'Project A summary', targetUser: '', coreProblem: '', firstPrompt: '',
    } as never)
    s.setLatestAnalysis({ whatIsHappening: 'project A terminal' } as never)
    expect(useAppStore.getState().brainstormMessages.length).toBeGreaterThan(0)

    useAppStore.getState().resetForProjectSwitch()

    const after = useAppStore.getState()
    expect(after.brainstormMessages).toEqual([])
    expect(after.brainstormStreamingBuffer).toBe('')
    expect(after.brainstormPhase).toBe('idle')
    expect(after.brainstormErrorMessage).toBeNull()
    expect(after.lastExtractedProjectData).toBeNull()
    expect(after.latestAnalysis).toBeNull()
  })

  it('clears the Guidance screen: window source, cached window captures, phase and auto-analysis', () => {
    useAppStore.setState({
      selectedWindowSourceId: 'window:42:0',
      selectedWindowName: 'Project A terminal',
      availableWindows: [{ id: 'window:42:0', name: 'Project A terminal', thumbnailBase64: 'AAAA' }],
      analysisPhase: 'analyzing',
      analysisErrorMessage: 'old error',
      autoAnalysisEnabled: true,
      secondsUntilNextAutoAnalysis: 12,
    })

    useAppStore.getState().resetForProjectSwitch()

    const after = useAppStore.getState()
    expect(after.selectedWindowSourceId).toBeNull()
    expect(after.selectedWindowName).toBeNull()
    expect(after.availableWindows).toEqual([])
    expect(after.analysisPhase).toBe('idle')
    expect(after.analysisErrorMessage).toBeNull()
    expect(after.autoAnalysisEnabled).toBe(false)
    expect(after.secondsUntilNextAutoAnalysis).toBe(0)
  })
})
