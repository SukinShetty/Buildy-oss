import { describe, it, expect } from 'vitest'
import { parseQuestionReply } from './question-reply'
import { suggestionCopyText } from '../../renderer/src/answer-suggestion'

const GOAL_TEXT = 'Build an Invoices page in Tally that lists every saved invoice with its customer and total.'
const DONE_WHEN = 'the Invoices page shows three test invoices and the grand total equals the sum of their totals'
const PROMPT = 'Add a CSV export button to the Invoices page that downloads every invoice with date, customer and total.'

describe('spoken answers: the goal or prompt is its own field', () => {
  it('a goal comes back as its own field, with a verifiable Done-when check', () => {
    const out = parseQuestionReply(JSON.stringify({
      reply: "Here's a goal you can use for the invoices work.",
      suggestion: { kind: 'goal', text: GOAL_TEXT, doneWhen: DONE_WHEN },
    }))
    expect(out.reply).toBe("Here's a goal you can use for the invoices work.")
    expect(out.suggestion).toEqual({ kind: 'goal', text: GOAL_TEXT, doneWhen: DONE_WHEN })
    expect(suggestionCopyText(out.suggestion!)).toBe(`${GOAL_TEXT}\nDone when ${DONE_WHEN}`)
  })

  it('a prompt comes back as its own field', () => {
    const out = parseQuestionReply('```json\n' + JSON.stringify({ reply: 'Tell it this:', suggestion: { kind: 'prompt', text: PROMPT } }) + '\n```')
    expect(out.suggestion).toEqual({ kind: 'prompt', text: PROMPT })
    expect(suggestionCopyText(out.suggestion!)).toBe(PROMPT)
  })

  it('never leaves the suggestion quoted or repeated inside the reply', () => {
    const out = parseQuestionReply(JSON.stringify({
      reply: `You could tell the agent: "${PROMPT}" That should do it.`,
      suggestion: { kind: 'prompt', text: PROMPT },
    }))
    expect(out.reply).not.toContain(PROMPT)
    expect(out.reply).not.toMatch(/["“”]/)
    expect(out.reply).toBe('You could tell the agent: the prompt below That should do it.')

    const verbatim = parseQuestionReply(JSON.stringify({ reply: `Try this goal. ${GOAL_TEXT}`, suggestion: { kind: 'goal', text: GOAL_TEXT, doneWhen: DONE_WHEN } }))
    expect(verbatim.reply).not.toContain(GOAL_TEXT)
  })

  it('reads a Done-when line written inside the goal text', () => {
    const out = parseQuestionReply(JSON.stringify({ reply: 'Here you go.', suggestion: { kind: 'goal', text: `${GOAL_TEXT}\nDone when: ${DONE_WHEN}` } }))
    expect(out.suggestion).toEqual({ kind: 'goal', text: GOAL_TEXT, doneWhen: DONE_WHEN })
  })

  it('a goal without a verifiable check is not shown as a goal', () => {
    const out = parseQuestionReply(JSON.stringify({ reply: 'Here is a goal.', suggestion: { kind: 'goal', text: GOAL_TEXT } }))
    expect(out.suggestion).toBeUndefined()
    expect(out.reply).toBe('Here is a goal.')
  })

  it('plain answers keep working: no suggestion, plain text, or unreadable JSON', () => {
    expect(parseQuestionReply(JSON.stringify({ reply: 'The tests passed.', suggestion: null }))).toEqual({ reply: 'The tests passed.' })
    expect(parseQuestionReply('The tests passed.')).toEqual({ reply: 'The tests passed.' })
    // Never raw JSON on screen: a cut-off reply keeps its complete "reply" string.
    expect(parseQuestionReply('{"reply": "The tests passed.", "suggestion": {"kind": "pro').reply).toBe('The tests passed.')
    expect(parseQuestionReply('{"reply": ').reply).not.toContain('{')
    expect(parseQuestionReply('{}').reply).not.toContain('{')
  })
})
