// next-step.ts — pure: the line under the robot always says what to do next,
// in plain words. Unit-tested in next-step.test.ts.

import type { AnalysisResult } from '../types'

export interface NextStepInput {
  needsSetup: boolean
  pastedJustNow: boolean
  watchedSourceMessage: string | null   // main's message (why watching stopped or can't start)
  watchedWindowName: string | null
  isPaused: boolean
  thinking: boolean
  analysis: AnalysisResult | null
}

function agentLabel(analysis: AnalysisResult | null): string {
  switch (analysis?.agentName) {
    case 'claude_code': return 'Claude Code'
    case 'codex': return 'Codex'
    default: return 'your coding agent'
  }
}

const capitalized = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

export function nextStepLabel(i: NextStepInput): string {
  if (i.pastedJustNow) return 'Pasted — now press Enter in your terminal'
  if (i.needsSetup) return 'Next: finish setting me up — click the gear'
  if (i.watchedSourceMessage) return i.watchedSourceMessage
  if (!i.watchedWindowName) return "Next: show me your coding agent's window"
  if (i.isPaused) return 'Paused — click Resume to keep watching'
  if (i.thinking) return 'Looking at your coding agent…'

  const a = i.analysis
  const agent = agentLabel(a)
  if (!a) return `Watching ${agent} — first look coming up`
  if (a.terminalState === 'permission_prompt') return `${capitalized(agent)} is asking you something — answer it in the terminal`
  if (a.terminalState === 'working') return `Waiting for ${agent} to finish`
  if (a.needsHumanJudgment) return 'Next: answer the question in the panel'
  if (a.nextPrompt?.trim()) return 'Your prompt is ready — click Paste into terminal'
  return `Watching ${agent} — I'll tell you the next step`
}
