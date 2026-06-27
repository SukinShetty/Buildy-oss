// nemp-bridge.ts — main process
// ════════════════════════════════════════════════════════════════════════════
// ARCHITECTURE DECISION RECORD — Nemp Memory integration (loop engineering Block 2)
// ════════════════════════════════════════════════════════════════════════════
//
// B1 — Nemp's integration surface (inspected from nemp-mcp-server@0.2.2 tarball):
//   • package.json: { "type": "module", "main": "dist/index.js", "bin": ... }.
//     index.js is a SERVER ENTRYPOINT — importing it immediately connects an MCP
//     transport (stdio or HTTP/SSE). index.d.ts is `export {}` — i.e. the package
//     MAIN exports NOTHING usable as a library.
//   • BUT the internals are clean ES modules with real exports:
//       - dist/core/storage.js  → readMemories / writeMemories / findMemory /
//                                   upsertMemory / deleteMemory / updateMemoryIndex
//       - dist/core/search.js   → searchMemories(query, memories) (ranked)
//       - dist/core/detection.js→ detectStack(projectPath)
//       - dist/utils/paths.js   → getNempDir / getMemoriesPath (…)
//   • On-disk format: <projectPath>/.nemp/memories.json — a JSON ARRAY of
//       Memory = { key, value, tags[], timestamp, source, agent_id }.
//     Plus .nemp/MEMORY.md (human index), access.log, config.json.
//   • MCP tools (init/save/recall/list/forget/context/log) are thin wrappers over
//     those same core functions.
//
// B2 — Chosen integration: OPTION A (import Nemp as a library).
//   We import Nemp's internal core modules (core/storage, core/search,
//   core/detection) DIRECTLY and call their functions. Rationale:
//     • Reuses Nemp's exact storage + path + search logic (zero duplication) and
//       its on-disk format, so a user's existing separate Nemp install in the
//       same project dir is honoured automatically (same memories.json).
//     • No subprocess, no MCP client, no express/SSE overhead (Option B), and no
//       schema re-implementation (Option C).
//   Nuance: the package MAIN is not a library, so we import the internal module
//   paths. They are stable ESM with .d.ts. Because Nemp is ESM ("type":"module")
//   and Buildy's main process is CJS, we load them via dynamic import() (the only
//   CJS→ESM bridge) and type the result against local interfaces — so a future
//   internal reshuffle degrades gracefully (logged, memory simply no-ops) rather
//   than crashing Buildy.
//
// All memory stays 100% LOCAL (Nemp's guarantee) — JSON on disk, nothing leaves
// the device. Every read/write logs for debugging.
// ════════════════════════════════════════════════════════════════════════════

import { app } from 'electron'
import { join } from 'path'
import type { ProjectMemory, MemoryEntry, MemorySnapshot, Goal } from '../renderer/src/types'
import { loadProjectMemory, loadGoal } from './memory'

// ─── Local typings for Nemp's internal modules (loaded via dynamic import) ─────

interface NempMemory {
  key: string
  value: string
  tags: string[]
  timestamp: string
  source: string
  agent_id: string
}
interface NempStorageModule {
  readMemories(projectPath?: string): NempMemory[]
  writeMemories(memories: NempMemory[], projectPath?: string): void
  upsertMemory(memory: NempMemory, projectPath?: string): void
  deleteMemory(key: string, projectPath?: string): boolean
  updateMemoryIndex(projectPath?: string): void
}
interface NempSearchModule {
  searchMemories(
    query: string,
    memories: Array<{ key: string; value: string; tags: string[] }>
  ): Array<{ key: string; value: string; tags: string[]; score: number; matchType: string }>
}
interface NempDetectionModule {
  detectStack(projectPath: string): Array<{ key: string; value: string; tags: string[] }>
}

// ─── Module state ─────────────────────────────────────────────────────────────

const AGENT_ID = 'buildy'
const SOURCE = 'buildy'
const TAG = 'buildy'

let storage: NempStorageModule | null = null
let search: NempSearchModule | null = null
let detection: NempDetectionModule | null = null
let nempReady = false
let projectPath = ''   // the directory whose `.nemp/` holds memories.json

/** Lazy-load Nemp's ESM core modules (CJS→ESM via dynamic import). */
async function ensureNemp(): Promise<boolean> {
  if (nempReady) return true
  try {
    storage = (await import('nemp-mcp-server/dist/core/storage.js')) as unknown as NempStorageModule
    search = (await import('nemp-mcp-server/dist/core/search.js')) as unknown as NempSearchModule
    detection = (await import('nemp-mcp-server/dist/core/detection.js')) as unknown as NempDetectionModule
    nempReady = true
    console.log('[Nemp] Core modules loaded')
    return true
  } catch (error) {
    console.error('[Nemp] Failed to load core modules — memory disabled:', error)
    return false
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowISO(): string { return new Date().toISOString() }

function slug(text: string, max = 40): string {
  return (text || 'item')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'item'
}

function readAll(): NempMemory[] {
  if (!storage) return []
  try {
    return storage.readMemories(projectPath)
  } catch (error) {
    console.error('[Nemp] read failed:', error)
    return []
  }
}

function writeOne(mem: NempMemory): void {
  if (!storage) { console.warn('[Nemp] write skipped — Nemp not ready'); return }
  try {
    console.log(`[Nemp] WRITE ${mem.key} [${mem.tags.join(',')}] "${mem.value.slice(0, 60)}"`)
    storage.upsertMemory(mem, projectPath)
    storage.updateMemoryIndex(projectPath)
  } catch (error) {
    console.error('[Nemp] write failed:', error)
  }
}

function toEntry(m: NempMemory): MemoryEntry {
  return { key: m.key, value: m.value, tags: m.tags, timestamp: m.timestamp, source: m.source }
}

function hasTag(m: NempMemory, tag: string): boolean { return m.tags.includes(tag) }

// ─── Public bridge API ────────────────────────────────────────────────────────

/**
 * Point the bridge at a project's memory store. If `projectRoot` is given we use
 * its `.nemp/` (honouring an existing separate Nemp install); otherwise we keep a
 * Buildy-owned store under userData, namespaced by projectId.
 */
export async function init(projectId: string, projectRoot?: string): Promise<void> {
  projectPath = projectRoot && projectRoot.trim()
    ? projectRoot
    : join(app.getPath('userData'), 'buildy-memory', slug(projectId || 'default'))

  const ok = await ensureNemp()
  console.log(`[Nemp] init — projectId="${projectId}" path="${projectPath}" ready=${ok}`)
  if (!ok) return

  // Seed detected stack once (only if the store is empty), best-effort.
  try {
    if (projectRoot && readAll().length === 0 && detection) {
      const stack = detection.detectStack(projectRoot)
      for (const s of stack) {
        writeOne({ key: s.key, value: s.value, tags: [TAG, ...s.tags], timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
      }
      console.log(`[Nemp] Seeded ${stack.length} stack memories from ${projectRoot}`)
    }
  } catch (error) {
    console.warn('[Nemp] stack detection skipped:', error)
  }
}

// ─── Reading ──────────────────────────────────────────────────────────────────

/** Structured snapshot for the Memory screen. */
export async function getSnapshot(): Promise<MemorySnapshot> {
  const all = readAll()
  const goal = await loadGoal().catch(() => null)
  const byTime = [...all].sort((a, b) => b.timestamp.localeCompare(a.timestamp))
  console.log(`[Nemp] READ snapshot — ${all.length} memories`)

  return {
    goal,
    completed: all.filter((m) => hasTag(m, 'completion')).map(toEntry),
    inProgress: all.filter((m) => hasTag(m, 'inprogress')).map(toEntry),
    blockersOpen: all.filter((m) => hasTag(m, 'blocker') && hasTag(m, 'open')).map(toEntry),
    blockersResolved: all.filter((m) => hasTag(m, 'blocker') && hasTag(m, 'resolved')).map(toEntry),
    decisions: all.filter((m) => hasTag(m, 'decision')).map(toEntry),
    patterns: all.filter((m) => hasTag(m, 'pattern')).map(toEntry),
    recent: byTime.slice(0, 30).map(toEntry),
  }
}

/** ProjectMemory view (goal + completed + blockers) for prompt/context use. */
export async function getProjectMemory(): Promise<ProjectMemory> {
  const base = await loadProjectMemory()
  const all = readAll()
  return {
    ...base,
    completedFeatures: dedupe([
      ...base.completedFeatures,
      ...all.filter((m) => hasTag(m, 'completion')).map((m) => m.value),
    ]),
    activeBlockers: dedupe([
      ...base.activeBlockers,
      ...all.filter((m) => hasTag(m, 'blocker') && hasTag(m, 'open')).map((m) => m.value),
    ]),
  }
}

/** Compact, human-readable memory context for a Claude system prompt (~2k tokens). */
export async function getContextSummary(maxTokens = 2000): Promise<string> {
  const snap = await getSnapshot()
  const lines: string[] = []

  const list = (label: string, items: string[]): void => {
    if (items.length) {
      lines.push(`${label}:`)
      for (const it of items.slice(0, 12)) lines.push(`- ${it}`)
    }
  }

  if (snap.goal?.purpose) lines.push(`Goal: ${snap.goal.purpose}`)
  list('Completed features', snap.completed.map((m) => m.value))
  list('In progress', snap.inProgress.map((m) => m.value))
  list('Open blockers', snap.blockersOpen.map((m) => m.value))
  list('Resolved blockers', snap.blockersResolved.map((m) => m.value))
  list('Key decisions', snap.decisions.map((m) => m.value))
  list('Patterns Buildy noticed', snap.patterns.map((m) => m.value))
  list('Recent activity', snap.recent.slice(0, 8).map((m) => m.value))

  let text = lines.join('\n').trim()
  // Rough token cap (~4 chars/token).
  const maxChars = maxTokens * 4
  if (text.length > maxChars) text = text.slice(0, maxChars) + '\n…(truncated)'
  console.log(`[Nemp] READ context summary — ${text.length} chars`)
  return text
}

export async function searchMemories(query: string): Promise<MemoryEntry[]> {
  if (!search) return []
  const all = readAll()
  try {
    const results = search.searchMemories(query, all.map((m) => ({ key: m.key, value: m.value, tags: m.tags })))
    console.log(`[Nemp] SEARCH "${query}" → ${results.length} hits`)
    // Re-hydrate timestamp/source from the original memories.
    return results.map((r) => {
      const orig = all.find((m) => m.key === r.key)
      return { key: r.key, value: r.value, tags: r.tags, timestamp: orig?.timestamp || nowISO(), source: orig?.source || SOURCE }
    })
  } catch (error) {
    console.error('[Nemp] search failed:', error)
    return []
  }
}

// ─── Writing ──────────────────────────────────────────────────────────────────

export async function recordObservation(text: string, sourceAnalysisId?: string): Promise<void> {
  if (!text?.trim()) return
  const key = `obs:${Date.now()}:${slug(text, 24)}`
  const tags = [TAG, 'observation']
  if (sourceAnalysisId) tags.push(`analysis:${sourceAnalysisId}`)
  writeOne({ key, value: text.trim(), tags, timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
}

export async function recordCompletion(feature: string): Promise<void> {
  if (!feature?.trim()) return
  writeOne({ key: `completion:${slug(feature)}`, value: feature.trim(), tags: [TAG, 'completion'], timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
}

export async function recordBlocker(description: string): Promise<void> {
  if (!description?.trim()) return
  writeOne({ key: `blocker:${slug(description)}`, value: description.trim(), tags: [TAG, 'blocker', 'open'], timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
}

export async function resolveBlocker(blockerId: string, resolution: string): Promise<void> {
  const all = readAll()
  const found = all.find((m) => m.key === blockerId)
  if (!found) { console.warn(`[Nemp] resolveBlocker: ${blockerId} not found`); return }
  writeOne({
    ...found,
    value: `${found.value}\nResolved: ${resolution}`,
    tags: [...found.tags.filter((t) => t !== 'open'), 'resolved'],
    timestamp: nowISO(),
  })
}

export async function recordDecision(question: string, choice: string, reasoning?: string): Promise<void> {
  if (!choice?.trim()) return
  const value = `Q: ${question}\nChoice: ${choice}${reasoning ? `\nWhy: ${reasoning}` : ''}`
  writeOne({ key: `decision:${slug(question || choice)}`, value, tags: [TAG, 'decision'], timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
}

export async function recordPattern(observation: string, confidence: 'low' | 'medium' | 'high'): Promise<void> {
  if (!observation?.trim()) return
  writeOne({ key: `pattern:${slug(observation)}`, value: observation.trim(), tags: [TAG, 'pattern', confidence], timestamp: nowISO(), source: SOURCE, agent_id: AGENT_ID })
}

// ─── Sync / maintenance ───────────────────────────────────────────────────────

/** Generate a BUILDY.md file from the current memory snapshot. */
export async function exportToBuildyMd(filePath: string): Promise<void> {
  const { promises: fs } = await import('fs')
  const snap = await getSnapshot()
  const section = (title: string, items: MemoryEntry[]): string =>
    items.length ? `\n## ${title}\n` + items.map((m) => `- ${m.value.replace(/\n/g, ' ')} _(${m.timestamp.slice(0, 10)})_`).join('\n') + '\n' : ''

  let md = `# BUILDY.md\n\n> Buildy's project memory. Auto-generated ${nowISO().slice(0, 10)}. 100% local.\n`
  if (snap.goal?.purpose) md += `\n## Goal\n${snap.goal.purpose}\n`
  md += section('Completed features', snap.completed)
  md += section('In progress', snap.inProgress)
  md += section('Open blockers', snap.blockersOpen)
  md += section('Resolved blockers', snap.blockersResolved)
  md += section('Key decisions', snap.decisions)
  md += section('Patterns Buildy noticed', snap.patterns)
  md += section('Recent activity', snap.recent)

  await fs.writeFile(filePath, md, 'utf-8')
  console.log(`[Nemp] Exported BUILDY.md → ${filePath}`)
}

/** Wipe all Buildy-written memories from the store. */
export async function resetMemory(): Promise<void> {
  if (!storage) return
  const all = readAll()
  const keep = all.filter((m) => !m.tags.includes(TAG))
  try {
    storage.writeMemories(keep, projectPath)
    storage.updateMemoryIndex(projectPath)
    console.log(`[Nemp] RESET — removed ${all.length - keep.length} Buildy memories (kept ${keep.length} others)`)
  } catch (error) {
    console.error('[Nemp] reset failed:', error)
  }
}

// ─── util ──────────────────────────────────────────────────────────────────────

function dedupe(items: string[]): string[] {
  return [...new Set(items.filter((s) => s && s.trim()))]
}
