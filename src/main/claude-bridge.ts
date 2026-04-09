// claude-bridge.ts — main process
// All Claude API calls live here. The main process owns API keys and makes
// all external requests — API keys never touch the renderer process.
//
// Two functions:
//   analyzeScreen()   — non-streaming, returns structured JSON for guidance
//   streamBrainstorm() — streaming SSE, pushes chunks back to the renderer window

import type { WebContents } from 'electron'
import type {
  ProjectMemory,
  CaptureResult,
  AnalysisResult,
  AppSettings,
  ChatMessage,
  ExtractedProjectData,
} from '../renderer/src/types'
import { IPC } from '../renderer/src/types'

// ─── Analysis (non-streaming) ─────────────────────────────────────────────────

/**
 * Sends a screenshot + project context to Claude and returns structured guidance.
 * Non-streaming because we need to parse the full JSON before displaying anything.
 */
export async function analyzeScreen(
  capture: CaptureResult,
  project: ProjectMemory,
  settings: AppSettings
): Promise<AnalysisResult> {
  const startTime = Date.now()

  const systemPrompt = buildAnalysisSystemPrompt(project)
  const userPrompt = buildAnalysisUserPrompt(project, capture)

  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: 'image/jpeg',
              data: capture.imageBase64,
            },
          },
          {
            type: 'text',
            text: `Screenshot of: ${capture.windowTitle}`,
          },
          {
            type: 'text',
            text: userPrompt,
          },
        ],
      },
    ],
  }

  const responseText = await callClaudeAPI(requestBody, settings)
  const analysisResult = parseAnalysisResult(responseText, startTime)
  return analysisResult
}

// ─── Brainstorm (streaming) ───────────────────────────────────────────────────

/**
 * Sends a brainstorm message to Claude with streaming.
 * Pushes text chunks to the renderer via IPC as they arrive.
 * When complete, also pushes the extracted project data (name, summary, etc.)
 * so the renderer can pre-fill the project memory fields.
 */
export async function streamBrainstorm(
  senderWebContents: WebContents,
  userMessage: string,
  conversationHistory: ChatMessage[],
  settings: AppSettings
): Promise<void> {
  const systemPrompt = buildBrainstormSystemPrompt()

  // Build the messages array from history + new user message
  const messages = [
    ...conversationHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ]

  const requestBody = {
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    stream: true,
    system: systemPrompt,
    messages,
  }

  const apiUrl = resolveApiUrl(settings, '/chat')
  const headers = buildRequestHeaders(settings)

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errorText}`)
    }

    if (!response.body) {
      throw new Error('Claude API returned no response body')
    }

    // Read SSE stream
    const reader = response.body.getReader()
    const textDecoder = new TextDecoder()
    let accumulatedText = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      const chunk = textDecoder.decode(value, { stream: true })
      const lines = chunk.split('\n')

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        const jsonString = line.slice(6).trim()
        if (jsonString === '[DONE]') break

        try {
          const event = JSON.parse(jsonString)
          if (
            event.type === 'content_block_delta' &&
            event.delta?.type === 'text_delta' &&
            event.delta?.text
          ) {
            accumulatedText += event.delta.text
            // Push chunk to renderer for live display
            if (!senderWebContents.isDestroyed()) {
              senderWebContents.send(IPC.BRAINSTORM_CHUNK, event.delta.text)
            }
          }
        } catch {
          // Non-JSON SSE lines (e.g. comments) — ignore
        }
      }
    }

    // Attempt to extract structured project data from the full response
    const extractedProjectData = tryExtractProjectDataFromBrainstormResponse(accumulatedText)

    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send(IPC.BRAINSTORM_DONE, {
        fullText: accumulatedText,
        extractedProjectData,
      })
    }
  } catch (error) {
    if (!senderWebContents.isDestroyed()) {
      senderWebContents.send(IPC.BRAINSTORM_ERROR, String(error))
    }
  }
}

// ─── System Prompts ───────────────────────────────────────────────────────────

function buildAnalysisSystemPrompt(project: ProjectMemory): string {
  const projectContext = formatProjectContextForClaude(project)
  const explanationInstruction = explanationStyleInstruction(project.explanationStyle)

  return `You are Buildy, an AI builder buddy helping non-technical founders build real products with Claude Code.

${projectContext}

You are looking at a screenshot of the user's screen. Your job is to analyze what Claude Code is doing and give structured, practical guidance.

Explanation style: ${explanationInstruction}

CRITICAL TRANSLATION RULES — always convert jargon to plain language:
- "Installing dependencies" → "Getting the tools your app needs"
- "Running tests" → "Checking that things work correctly"
- "Build failed" → "Something went wrong — the app can't run yet"
- "API endpoint" → "A connection point to another service"
- "Database migration" → "Updating how your data is organized"
- "Git commit" → "Saving a checkpoint of your work"
- "Compiling" → "Turning code into a working app"
- "npm install" → "Installing the pieces your app depends on"

The "nextPromptForClaudeCode" field is the most important thing you produce. Make it:
- Specific to their actual project, not generic
- Exactly what the user should paste into Claude Code next
- Actionable and clear

The "builderNote" should be a warm, encouraging 1-sentence note from a builder buddy who is proud of their progress.

YOU MUST RESPOND WITH VALID JSON ONLY. No markdown fences, no text before or after. Use this exact structure:
{
  "claudeCodeVisible": true,
  "whatIsHappening": "1-2 sentences: what Claude Code is doing right now, in plain language",
  "whatItMeans": "1-2 sentences: why this matters for their product",
  "whatIsBuilt": ["thing that appears to be done", "another done thing"],
  "whatIsMissing": ["feature still needed", "another missing feature"],
  "whatIsBroken": ["specific error or broken thing"],
  "whereUserIsStuck": "description if they appear stuck, or null",
  "bestNextMove": "One clear sentence — what should they do right now?",
  "nextPromptForClaudeCode": "The exact prompt to paste into Claude Code. Be specific to their project.",
  "builderNote": "Short encouraging note from a builder buddy."
}`
}

function buildBrainstormSystemPrompt(): string {
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

// ─── Prompt helpers ───────────────────────────────────────────────────────────

function buildAnalysisUserPrompt(project: ProjectMemory, capture: CaptureResult): string {
  const projectDescription = project.projectName
    ? `I am building: ${project.projectName}. ${project.productSummary}`
    : "I haven't set up my project details yet."

  return `${projectDescription}

Please analyze this screenshot and tell me:
1. What is Claude Code doing right now?
2. What does it mean for my product?
3. What has been built so far?
4. What is still missing?
5. Is anything broken?
6. Am I stuck somewhere?
7. What should I do next?
8. What exact prompt should I paste into Claude Code?

Remember: explain everything as if I'm not a technical person.`
}

function formatProjectContextForClaude(project: ProjectMemory): string {
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

// ─── Response parsing ─────────────────────────────────────────────────────────

function parseAnalysisResult(claudeResponseText: string, startTime: number): AnalysisResult {
  // Strip markdown code fences if Claude wrapped the JSON in them
  const cleanedText = claudeResponseText
    .replace(/^```json\s*/m, '')
    .replace(/^```\s*/m, '')
    .replace(/```\s*$/m, '')
    .trim()

  let parsed: Partial<AnalysisResult>
  try {
    parsed = JSON.parse(cleanedText)
  } catch {
    // Claude returned something that's not valid JSON — wrap it in a fallback result
    return {
      claudeCodeVisible: false,
      whatIsHappening: claudeResponseText.slice(0, 300),
      whatItMeans: 'Buildy had trouble reading the response. Try analyzing again.',
      whatIsBuilt: [],
      whatIsMissing: [],
      whatIsBroken: [],
      whereUserIsStuck: null,
      bestNextMove: 'Click "Analyze Now" again to get a fresh read.',
      nextPromptForClaudeCode: '',
      builderNote: 'No worries — sometimes it takes a second try!',
      analyzedAt: new Date().toISOString(),
      analysisDurationMs: Date.now() - startTime,
    }
  }

  return {
    claudeCodeVisible: parsed.claudeCodeVisible ?? false,
    whatIsHappening: parsed.whatIsHappening ?? '',
    whatItMeans: parsed.whatItMeans ?? '',
    whatIsBuilt: parsed.whatIsBuilt ?? [],
    whatIsMissing: parsed.whatIsMissing ?? [],
    whatIsBroken: parsed.whatIsBroken ?? [],
    whereUserIsStuck: parsed.whereUserIsStuck ?? null,
    bestNextMove: parsed.bestNextMove ?? '',
    nextPromptForClaudeCode: parsed.nextPromptForClaudeCode ?? '',
    builderNote: parsed.builderNote ?? '',
    analyzedAt: new Date().toISOString(),
    analysisDurationMs: Date.now() - startTime,
  }
}

/**
 * After a brainstorm conversation, Claude may include a structured summary block.
 * This function tries to extract it.
 */
function tryExtractProjectDataFromBrainstormResponse(
  fullResponseText: string
): ExtractedProjectData | null {
  const summaryBlockMatch = fullResponseText.match(
    /---BUILDY_PROJECT_SUMMARY---([\s\S]+?)---END_BUILDY_PROJECT_SUMMARY---/
  )
  if (!summaryBlockMatch) return null

  const summaryBlock = summaryBlockMatch[1]

  function extractField(fieldName: string): string {
    const match = summaryBlock.match(new RegExp(`${fieldName}:\\s*(.+)`))
    return match ? match[1].trim() : ''
  }

  return {
    projectName: extractField('PROJECT_NAME'),
    productSummary: extractField('PRODUCT_SUMMARY'),
    targetUser: extractField('TARGET_USER'),
    coreProblem: extractField('CORE_PROBLEM'),
    brainstormSummary: extractField('MVP_FOCUS'),
  }
}

// ─── API call helper ──────────────────────────────────────────────────────────

async function callClaudeAPI(
  requestBody: Record<string, unknown>,
  settings: AppSettings
): Promise<string> {
  const apiUrl = resolveApiUrl(settings, '/chat')
  const headers = buildRequestHeaders(settings)

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Claude API error ${response.status}: ${errorText}`)
  }

  const responseJson = await response.json() as {
    content?: Array<{ type: string; text?: string }>
  }

  const textBlock = responseJson.content?.find((block) => block.type === 'text')
  if (!textBlock?.text) {
    throw new Error('Claude API returned no text content')
  }

  return textBlock.text
}

function resolveApiUrl(settings: AppSettings, path: string): string {
  if (settings.useProxy && settings.proxyUrl) {
    return `${settings.proxyUrl.replace(/\/$/, '')}${path}`
  }
  // Direct Anthropic API
  return `https://api.anthropic.com/v1/messages`
}

function buildRequestHeaders(settings: AppSettings): Record<string, string> {
  if (settings.useProxy && settings.proxyUrl) {
    // Proxy doesn't need the API key in the request — it's stored on the worker
    return { 'Content-Type': 'application/json' }
  }
  // Direct Anthropic API
  return {
    'Content-Type': 'application/json',
    'x-api-key': settings.anthropicApiKey,
    'anthropic-version': '2023-06-01',
  }
}
