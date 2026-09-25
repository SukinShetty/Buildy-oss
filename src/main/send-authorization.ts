// send-authorization.ts — main process (ELECTRON-FREE, unit-tested)
// A paste is authorized for EXACTLY what was on screen when the user clicked:
// the prompt text and id, the active project, the watch session and the watched
// source. The binding is re-checked after every await on the way to the paste
// keystroke, and each prompt id can be authorized only once.

import type { SendPromptResult } from '../renderer/src/types'

export interface SendContext {
  promptId: string | null
  promptText: string
  projectId: string | null
  session: number
  sourceId: string | null
}

export type SendAuthorization =
  | { ok: true; binding: SendContext }
  | { ok: false; reason: string }

const PROMPT_CHANGED = 'The prompt changed before it could be pasted.'

export class SendAuthorizer {
  private readonly consumed = new Set<string>()
  private readonly inFlight = new Set<string>()

  /**
   * Called once per click with the id the renderer sent and the current main-side
   * state. Every successful authorize() MUST be followed by finish().
   */
  authorize(requestedPromptId: string, now: SendContext): SendAuthorization {
    if (!now.promptId || !now.promptText.trim() || now.promptId !== requestedPromptId) {
      return { ok: false, reason: PROMPT_CHANGED }
    }
    if (this.consumed.has(requestedPromptId)) {
      return { ok: false, reason: 'This prompt was already pasted.' }
    }
    if (this.inFlight.has(requestedPromptId)) {
      return { ok: false, reason: 'This prompt is already being pasted.' }
    }
    this.inFlight.add(requestedPromptId)
    return { ok: true, binding: { ...now } }
  }

  /**
   * End an attempt. Only a successful paste uses the authorization up; a failed
   * attempt (missing permission, window not in front, timeout) can be retried.
   */
  finish(promptId: string, pasted: boolean): void {
    this.inFlight.delete(promptId)
    if (pasted) this.consumed.add(promptId)
  }

  /** null while the binding still holds; otherwise a plain-English reason naming what changed. */
  changed(binding: SendContext, now: SendContext): string | null {
    if (now.promptId !== binding.promptId || now.promptText !== binding.promptText) return PROMPT_CHANGED
    if (now.projectId !== binding.projectId) return 'The project changed before the prompt could be pasted.'
    if (now.session !== binding.session) return 'The watch was restarted before the prompt could be pasted.'
    if (now.sourceId !== binding.sourceId) return 'The watched window changed before the prompt could be pasted.'
    return null
  }
}

/** The verifier tracks a prompt only when it was really pasted and the binding still held. */
export function shouldRegisterOutcome(result: SendPromptResult, changedReason: string | null): boolean {
  return result.sent && changedReason === null
}
