import { describe, it, expect, vi } from 'vitest'
import { guardedSender } from './project-guard'

describe('guardedSender — responses are tagged with the project they started for', () => {
  it('delivers while the project is still active, drops everything after a switch', () => {
    const send = vi.fn()
    let active = 'proj-A'
    const sender = guardedSender({ send, isDestroyed: () => false }, 'proj-A', () => active)

    sender.send('mybuildy:brainstorm-chunk', 'first chunk')
    active = 'proj-B' // the user switched projects mid-stream
    sender.send('mybuildy:brainstorm-chunk', 'late chunk for project A')
    sender.send('mybuildy:brainstorm-done', { fullText: 'project A answer' })

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('mybuildy:brainstorm-chunk', 'first chunk')
  })

  it('reports a destroyed window like the real one', () => {
    const sender = guardedSender({ send: vi.fn(), isDestroyed: () => true }, 'p', () => 'p')
    expect(sender.isDestroyed()).toBe(true)
  })
})
