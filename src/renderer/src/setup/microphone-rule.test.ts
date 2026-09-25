// The microphone is asked for only the first time the user clicks the mic
// button — never during setup.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'

const renderer = (...p: string[]): string => readFileSync(join(__dirname, '..', ...p), 'utf8')

describe('microphone permission', () => {
  it('setup never touches the microphone', () => {
    const wizard = renderer('setup', 'SetupWizard.tsx') + renderer('setup', 'setup-model.ts')
    expect(wizard).not.toMatch(/getUserMedia|mediaDevices|askForMediaAccess/)
    const main = readFileSync(join(__dirname, '..', '..', '..', 'main', 'setup-permissions.ts'), 'utf8')
    expect(main).not.toMatch(/askForMediaAccess|getUserMedia/)
  })

  it('the companion asks only inside startRecording (the mic button)', () => {
    const src = renderer('companion', 'CompanionApp.tsx')
    expect([...src.matchAll(/getUserMedia\(/g)]).toHaveLength(1)
    const start = src.indexOf('const startRecording')
    const end = src.indexOf('const stopRecording')
    for (const m of src.matchAll(/getUserMedia/g)) {
      expect(m.index!).toBeGreaterThan(start)
      expect(m.index!).toBeLessThan(end)
    }
  })
})
