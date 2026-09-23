// model-list.test.ts
// Pure model-list filtering per provider, driven by recorded JSON fixtures
// (neutral sample data — public model catalog shapes only).

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  filterOpenAIModels,
  filterGeminiModels,
  filterOpenRouterModels,
  parseAnthropicModels,
  parseOllamaTags,
  parseOpenAICompatibleList,
  OPEN_WEIGHT_GROUP,
  OTHER_GROUP,
} from './model-list'

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(join(__dirname, 'fixtures', name), 'utf-8'))
}

describe('filterOpenAIModels', () => {
  const models = filterOpenAIModels(fixture('openai-models.json'))
  const ids = models.map((m) => m.id)

  it('keeps chat-capable models', () => {
    expect(ids).toContain('gpt-4o')
    expect(ids).toContain('gpt-4o-mini')
    expect(ids).toContain('gpt-4.1')
    expect(ids).toContain('o3')
    expect(ids).toContain('o4-mini')
  })

  it('drops embedding, tts, whisper, transcribe, dall-e, image, moderation, audio, realtime models', () => {
    expect(ids).not.toContain('text-embedding-3-small')
    expect(ids).not.toContain('tts-1-hd')
    expect(ids).not.toContain('whisper-1')
    expect(ids).not.toContain('gpt-4o-transcribe')
    expect(ids).not.toContain('dall-e-3')
    expect(ids).not.toContain('gpt-image-1')
    expect(ids).not.toContain('omni-moderation-latest')
    expect(ids).not.toContain('gpt-4o-audio-preview')
    expect(ids).not.toContain('gpt-4o-realtime-preview')
  })
})

describe('filterGeminiModels', () => {
  const models = filterGeminiModels(fixture('gemini-models.json'))
  const ids = models.map((m) => m.id)

  it('keeps models supporting generateContent, with the models/ prefix stripped', () => {
    expect(ids).toContain('gemini-2.5-pro')
    expect(ids).toContain('gemini-2.5-flash')
    expect(ids).toContain('gemini-2.0-flash')
  })

  it('drops models without generateContent', () => {
    expect(ids).not.toContain('text-embedding-004')
    expect(ids).not.toContain('imagen-3.0-generate-002')
  })

  it('drops embedding and aqa models even when they claim generateContent', () => {
    expect(ids).not.toContain('gemini-embedding-001')
    expect(ids).not.toContain('aqa')
  })

  it('uses the display name as the label', () => {
    const flash = models.find((m) => m.id === 'gemini-2.5-flash')
    expect(flash?.label).toBe('Gemini 2.5 Flash')
  })
})

describe('filterOpenRouterModels', () => {
  const models = filterOpenRouterModels(fixture('openrouter-models.json'))
  const ids = models.map((m) => m.id)

  it('keeps ONLY models whose architecture.input_modalities includes image', () => {
    expect(ids).toContain('anthropic/claude-sonnet-4')
    expect(ids).toContain('meta-llama/llama-3.2-90b-vision-instruct')
    expect(ids).not.toContain('deepseek/deepseek-r1')
    expect(ids).not.toContain('mistralai/mistral-7b-instruct')
  })

  it('groups open-weight models FIRST, then other models', () => {
    const groups = models.map((m) => m.group)
    const lastOpen = groups.lastIndexOf(OPEN_WEIGHT_GROUP)
    const firstOther = groups.indexOf(OTHER_GROUP)
    expect(lastOpen).toBeGreaterThanOrEqual(0)
    expect(firstOther).toBeGreaterThan(lastOpen)
  })

  it('classifies open-weight ids by prefix', () => {
    const byId = new Map(models.map((m) => [m.id, m]))
    expect(byId.get('meta-llama/llama-3.2-90b-vision-instruct')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('qwen/qwen2.5-vl-72b-instruct')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('mistralai/pixtral-large-2411')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('google/gemma-3-27b-it')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('z-ai/glm-4.5v')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('moonshotai/kimi-vl-a3b-thinking')?.group).toBe(OPEN_WEIGHT_GROUP)
    expect(byId.get('anthropic/claude-sonnet-4')?.group).toBe(OTHER_GROUP)
    expect(byId.get('openai/gpt-4o')?.group).toBe(OTHER_GROUP)
  })

  it('maps pricing to dollars per million tokens', () => {
    const sonnet = models.find((m) => m.id === 'anthropic/claude-sonnet-4')
    expect(sonnet?.promptPricePerM).toBeCloseTo(3, 6)
    expect(sonnet?.completionPricePerM).toBeCloseTo(15, 6)
    const gemma = models.find((m) => m.id === 'google/gemma-3-27b-it')
    expect(gemma?.promptPricePerM).toBeCloseTo(0.1, 6)
  })
})

describe('parseAnthropicModels', () => {
  const models = parseAnthropicModels(fixture('anthropic-models.json'))

  it('returns every listed model with its display name', () => {
    expect(models.map((m) => m.id)).toContain('claude-sonnet-4-5-20250929')
    const sonnet = models.find((m) => m.id === 'claude-sonnet-4-5-20250929')
    expect(sonnet?.label).toBe('Claude Sonnet 4.5')
    expect(models).toHaveLength(5)
  })
})

describe('parseOllamaTags', () => {
  it('lists installed model names', () => {
    const models = parseOllamaTags(fixture('ollama-tags.json'))
    expect(models.map((m) => m.id)).toEqual(['llava:latest', 'gemma3:4b', 'qwen2.5:7b'])
  })
})

describe('parseOpenAICompatibleList', () => {
  it('lists model ids without filtering (local/custom servers)', () => {
    const models = parseOpenAICompatibleList({ data: [{ id: 'local-vision-model' }, { id: 'another-model' }] })
    expect(models.map((m) => m.id)).toEqual(['local-vision-model', 'another-model'])
  })

  it('returns empty for malformed payloads', () => {
    expect(parseOpenAICompatibleList({})).toEqual([])
    expect(parseOpenAICompatibleList(null)).toEqual([])
  })
})
