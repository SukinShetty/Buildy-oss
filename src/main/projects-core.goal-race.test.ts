import { describe, it, expect } from 'vitest'
import { applyGoalSaved, type ProjectsFile } from './projects-core'

const file = (): ProjectsFile => ({
  activeProjectId: 'proj-B', // the user has ALREADY switched to B
  projects: [
    { id: 'proj-A', name: 'My project', goalText: '', createdAt: '2026-01-01T00:00:00Z', lastActiveAt: '2026-01-01T00:00:00Z' },
    { id: 'proj-B', name: 'My project', goalText: '', createdAt: '2026-01-02T00:00:00Z', lastActiveAt: '2026-01-02T00:00:00Z' },
  ],
  migratedAt: '2026-01-01T00:00:00Z',
} as ProjectsFile)

describe('a goal save for project A finishing after the switch to B', () => {
  it('updates A (captured at the start), never B', () => {
    const after = applyGoalSaved(file(), 'Recipe Box app for home cooks', 'proj-A')
    const a = after.projects.find((p) => p.id === 'proj-A')!
    const b = after.projects.find((p) => p.id === 'proj-B')!
    expect(a.goalText).toBe('Recipe Box app for home cooks')
    expect(a.name).not.toBe('My project') // named from A's own goal
    expect(b.goalText).toBe('')
    expect(b.name).toBe('My project') // never named from another project's goal
  })

  it('an unknown project id changes nothing', () => {
    const before = file()
    expect(applyGoalSaved(before, 'Anything', 'proj-gone')).toEqual(before)
  })
})
