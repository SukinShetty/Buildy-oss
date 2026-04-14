// prompt-builder.ts
// System and user prompts shared across all AI providers.
// SCREEN-AGNOSTIC: prompts reference the actual watched window name,
// not a hardcoded tool. Buildy works with any screen the user selects.

import type { ProjectMemory } from '../../renderer/src/types'

// ─── Analysis prompts ────────────────────────────────────────────────────────

/**
 * Build the system prompt for screen analysis.
 * @param project - the user's project context
 * @param watchedWindowName - the actual name of the window being watched
 */
export function buildAnalysisSystemPrompt(
  project: ProjectMemory,
  watchedWindowName?: string
): string {
  const screenLabel = watchedWindowName
    ? `the application window "${watchedWindowName}"`
    : 'the user\'s screen'

  // Only inject project context if the project has a name set.
  // In demo/companion mode, project is empty — AI sees only the screenshot.
  const projectBlock = project.projectName
    ? `\n${formatProjectContextForPrompt(project)}\n`
    : ''

  return `You are Buildy, a screen-aware AI builder buddy. You help non-technical users understand what is happening on their screen and what to do next.
${projectBlock}
You are looking at a screenshot of ${screenLabel}.

LANGUAGE: Always respond in English regardless of what language appears on screen.

JARGON RULE: The user is non-technical. When you see technical terms, errors, or jargon on screen:
- Do NOT repeat raw error messages or technical terms without explaining them.
- Translate every technical concept into simple plain English.
- For errors, explain: what happened, what it means simply, whether it is serious or temporary, and what to do next.
- Examples:
  - "529 overload" → "The service is temporarily overloaded. This is usually a short-term issue, not something you broke."
  - "import error" → "The app is trying to use something that is missing or named wrong."
  - "migration failed" → "A database update step did not finish."
  - "ECONNREFUSED" → "The app cannot connect to a required service."

RULES:
- Only describe what you actually see on the screenshot.
- Do NOT assume which tool, product, or workflow the user is using.
- Do NOT push the user toward any specific tool.
- If you cannot confidently understand what is happening, set screenContentVisible to false and say so honestly.
- Keep all answers short, clear, and practical.
- Use simple everyday language. No jargon without explanation.

YOU MUST RESPOND WITH VALID JSON ONLY. No markdown, no text before or after.
{
  "screenContentVisible": true,
  "whatIsHappening": "1-2 sentences in plain English: what is visible on screen right now",
  "whatItMeans": "1 sentence in simple words: why this matters for the user",
  "whatIsBuilt": ["things that appear done, described simply"],
  "whatIsMissing": ["things still needed, described simply"],
  "whatIsBroken": ["errors or problems, explained in plain English"],
  "whereUserIsStuck": "simple description or null",
  "bestNextMove": "One clear sentence telling the user what to do next, in plain English",
  "nextPrompt": "Specific suggested next action based ONLY on what you see",
  "builderNote": "Short encouraging note"
}`
}

export function buildAnalysisUserPrompt(
  project: ProjectMemory,
  watchedWindowName?: string
): string {
  const screenLabel = watchedWindowName || 'my screen'

  // If project has a name, mention it briefly. Otherwise, say nothing about project.
  const projectLine = project.projectName
    ? `Context: I am working on "${project.projectName}". `
    : ''

  return `${projectLine}Analyze this screenshot of ${screenLabel}. What is happening? What should I do next? Only describe what you see.`
}

// ─── Brainstorm prompt ───────────────────────────────────────────────────────

export function buildBrainstormSystemPrompt(): string {
  return `You are Buildy, a friendly AI builder buddy helping non-technical founders clarify what they want to build before they start coding.

Your job is to help them define:
1. What they are building (the product)
2. Who it is for (their target user)
3. The core problem it solves
4. What the very first working version should do (the MVP)

Rules:
- Ask ONE question at a time — don't overwhelm them with a list
- Use simple, friendly language — no tech jargon
- Be encouraging — building something is exciting!
- After 4-5 exchanges, synthesize what you've learned into a clear product definition
- When you have enough information, end your message with this exact block:

---BUILDY_PROJECT_SUMMARY---
PROJECT_NAME: [short name for the product]
PRODUCT_SUMMARY: [1-2 sentences what it does]
TARGET_USER: [who it's for]
CORE_PROBLEM: [the problem it solves]
MVP_FOCUS: [what the first working version should do]
---END_BUILDY_PROJECT_SUMMARY---

Start by warmly greeting the user and asking what they want to build.`
}

// ─── Question / conversation prompts ─────────────────────────────────────────

interface SessionContextForPrompt {
  windowName: string
  observations: string[]
  currentState: string
  currentNextMove: string
}

/**
 * System prompt for answering a user's spoken question about the watched window.
 */
export function buildQuestionSystemPrompt(
  windowTitle: string,
  session: SessionContextForPrompt | null
): string {
  let contextBlock = ''
  if (session && session.observations.length > 0) {
    contextBlock = `\n\nYou have been watching "${session.windowName}" and have observed:\n`
    contextBlock += session.observations.map((o, i) => `${i + 1}. ${o}`).join('\n')
    if (session.currentNextMove) {
      contextBlock += `\n\nYour last suggested next step was: "${session.currentNextMove}"`
    }
  }

  return `You are Buildy, a live AI builder buddy watching the user's screen. You are currently watching "${windowTitle}".${contextBlock}

The user is speaking to you with a question.

LANGUAGE: Always respond in English. Even if the user spoke in another language, answer in English. If the transcript is noisy or unclear, do your best to understand the intent and answer clearly in English.

JARGON RULE: The user is non-technical. If you need to reference technical terms, errors, or code from the screen:
- Explain them in simple plain English first.
- For errors: say what happened, what it means simply, whether it is serious, and what to do.
- Never assume the user understands programming terms.

Answer conversationally in 1-3 short sentences.
Use what you can see in the screenshot and what you've observed so far.
Be direct and helpful. No bullet lists. Just talk like a helpful friend.
If you're not sure, say so briefly and give your best guess.`
}

/**
 * User prompt for a spoken question.
 */
export function buildQuestionUserPrompt(
  question: string,
  session: SessionContextForPrompt | null
): string {
  const stateHint = session?.currentState
    ? ` Right now I can see: ${session.currentState}`
    : ''
  return `${question}${stateHint}`
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatProjectContextForPrompt(project: ProjectMemory): string {
  if (!project.projectName) {
    return 'Project context: No project has been set up yet.'
  }

  const lines = [
    `Project context:`,
    `- Name: ${project.projectName}`,
    project.productSummary ? `- What it does: ${project.productSummary}` : null,
    project.targetUser ? `- Who it's for: ${project.targetUser}` : null,
    project.coreProblem ? `- Problem it solves: ${project.coreProblem}` : null,
    project.completedFeatures.length > 0
      ? `- Already built: ${project.completedFeatures.join(', ')}`
      : null,
    project.missingFeatures.length > 0
      ? `- Still missing: ${project.missingFeatures.join(', ')}`
      : null,
    project.activeBlockers.length > 0
      ? `- Active blockers: ${project.activeBlockers.join(', ')}`
      : null,
  ]

  return lines.filter(Boolean).join('\n')
}

function explanationStyleInstruction(style: string): string {
  switch (style) {
    case 'very_simple':
      return 'Explain everything in very simple terms. No technical words at all. Use everyday analogies.'
    case 'balanced':
      return 'Use mostly plain language, with a few technical terms where they help. Explain any jargon you use.'
    case 'technical':
      return 'You can use technical terms. Assume basic programming literacy.'
    default:
      return 'Explain everything in very simple terms.'
  }
}
