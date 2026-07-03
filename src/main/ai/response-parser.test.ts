import { describe, it, expect } from 'vitest'
import { parseAnalysisResponse, tryExtractProjectData } from './response-parser'

// A representative model output for a routine coding step — Buildy can default it,
// so needsHumanJudgment must be false.
const ROUTINE_STEP = JSON.stringify({
  screenContentVisible: true,
  whatIsHappening: 'The login page renders and the form is wired up.',
  whatItMeans: 'Auth is basically working.',
  whatIsBuilt: ['login form'],
  whatIsMissing: ['dashboard'],
  whatIsBroken: [],
  whereUserIsStuck: null,
  bestNextMove: 'Build the dashboard route next.',
  nextPrompt: 'Create a /dashboard route that lists customers in a table.',
  expectedOutcome: 'A /dashboard page renders a table of customers.',
  builderNote: 'Nice progress!',
  isCriticalOverride: false,
  needsHumanJudgment: false,
  humanJudgmentReason: '',
})

// A representative model output for an irreversible/destructive decision — this is
// a genuine human-judgment moment, so needsHumanJudgment must be true.
const DELETE_PROD_DB = JSON.stringify({
  screenContentVisible: true,
  whatIsHappening: 'A migration script is about to DROP the production users table.',
  whatItMeans: 'This would permanently delete all real user accounts.',
  whatIsBuilt: [],
  whatIsMissing: [],
  whatIsBroken: [],
  whereUserIsStuck: null,
  bestNextMove: 'Stop and decide whether deleting the production database is intended.',
  nextPrompt: '',
  expectedOutcome: '',
  builderNote: 'Big one — worth a pause.',
  isCriticalOverride: true,
  needsHumanJudgment: true,
  humanJudgmentReason: 'Dropping the production users table is irreversible and deletes real user data.',
})

describe('parseAnalysisResponse — hand-off detection (Block 6)', () => {
  it('does NOT flag a routine coding choice for human judgment', () => {
    const r = parseAnalysisResponse(ROUTINE_STEP, Date.now())
    expect(r.needsHumanJudgment).toBe(false)
    expect(r.humanJudgmentReason).toBe('')
  })

  it('flags an irreversible "delete production database" step for human judgment', () => {
    const r = parseAnalysisResponse(DELETE_PROD_DB, Date.now())
    expect(r.needsHumanJudgment).toBe(true)
    expect(r.humanJudgmentReason).toMatch(/production|irreversible|delete/i)
  })

  it('defaults needsHumanJudgment to false when the field is absent', () => {
    const r = parseAnalysisResponse('{"whatIsHappening":"typing code","nextPrompt":"x"}', Date.now())
    expect(r.needsHumanJudgment).toBe(false)
  })
})

describe('parseAnalysisResponse — expected outcome (Block 4)', () => {
  it('parses expectedOutcome alongside nextPrompt', () => {
    const r = parseAnalysisResponse(ROUTINE_STEP, Date.now())
    expect(r.nextPrompt).toContain('/dashboard')
    expect(r.expectedOutcome).toContain('table of customers')
  })
})

describe('tryExtractProjectData — brainstorm firstPrompt (Part 3)', () => {
  it('extracts a non-empty firstPrompt once the product is defined', () => {
    const full = `Great, I think I understand your idea!

---BUILDY_PROJECT_SUMMARY---
PROJECT_NAME: FreelanceCRM
PRODUCT_SUMMARY: A simple CRM for freelancers to track customers.
TARGET_USER: Solo freelancers.
CORE_PROBLEM: Freelancers lose track of client conversations.
MVP_FOCUS: A customer list page.
FIRST_PROMPT: Set up a new Next.js + Tailwind app called FreelanceCRM and build a /customers page that lists customers in a table with an Add customer button.
---END_BUILDY_PROJECT_SUMMARY---`

    const data = tryExtractProjectData(full)
    expect(data).not.toBeNull()
    expect(data!.projectName).toBe('FreelanceCRM')
    expect(data!.firstPrompt.length).toBeGreaterThan(0)
    expect(data!.firstPrompt).toMatch(/Next\.js/)
    expect(data!.firstPrompt).not.toContain('END_BUILDY_PROJECT_SUMMARY')
  })

  it('returns null when no summary block is present (product not yet defined)', () => {
    expect(tryExtractProjectData('Tell me more about who this is for?')).toBeNull()
  })
})
