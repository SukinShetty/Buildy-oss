// project-guard.ts — main process (ELECTRON-FREE, unit-tested)
// A streamed or delayed response (a brainstorm reply) is tagged with the project
// it was started for. guardedSender wraps the window it streams to: once a
// different project is active, every further message is dropped, so a reply
// meant for project A can never appear in project B.

export interface MessageTarget {
  send(channel: string, ...args: unknown[]): void
  isDestroyed(): boolean
}

export function guardedSender(
  target: MessageTarget,
  projectId: string | null,
  activeProjectId: () => string | null
): MessageTarget {
  let warned = false
  return {
    send(channel: string, ...args: unknown[]) {
      if (activeProjectId() !== projectId) {
        if (!warned) {
          warned = true
          console.log(`[Projects] dropped a late response for a project that is no longer active (${channel})`)
        }
        return
      }
      target.send(channel, ...args)
    },
    isDestroyed: () => target.isDestroyed(),
  }
}
