// CompanionApp.tsx
// Live companion UI — orb + controls + speech bubble + push-to-talk.
// Flow: click orb → pick window → live watching → speak/bubble on changes → ask questions.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import { useCompanionStore } from '../store/useCompanionStore'
import { Mascot } from '../components/Mascot'
import type { MascotState } from '../components/Mascot'
import type { AnalysisResult } from '../types'
import type { CompanionState, MicState } from '../store/useCompanionStore'

interface WindowItem { id: string; name: string; thumbnailBase64: string }

export function CompanionApp(): React.ReactElement {
  const {
    avatarState, latestAnalysis, isMuted, isPaused, isQuietMode,
    watchedWindowName, watchedSourceMessage, showWindowPicker,
    micState, micError, lastAnswer,
    setAvatarState, setLatestAnalysis, setMuted, setPaused, setQuietMode,
    setWatchedSource, setShowWindowPicker,
    setMicState, setMicError, setLastAnswer,
    clearAnalysis,
  } = useCompanionStore()

  const [windowList, setWindowList] = useState<WindowItem[]>([])
  const [needsApiKey, setNeedsApiKey] = useState(false)
  const isMutedRef = useRef(isMuted)
  isMutedRef.current = isMuted
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)

  // ─── Check if API key is configured ─────────────────────────────────

  useEffect(() => {
    window.buildy.loadSettings().then((s) => {
      setNeedsApiKey(!s.hasApiKey)
    }).catch(() => {})
  }, [])

  // ─── IPC listeners (once) ───────────────────────────────────────────

  useEffect(() => {
    const unsubs = [
      window.buildy.onCompanionAnalysis((_: unknown, a: AnalysisResult) => {
        setLastAnswer(null)
        setLatestAnalysis(a)
        // Render guidance in its OWN window so it never overflows the mascot.
        window.buildy.showGuidance(a)
      }),
      window.buildy.onCompanionState((_: unknown, s: string) => setAvatarState(s as CompanionState)),
      // NOTE: audio is no longer played here. Playback lives in the main-process
      // voice player (hidden window) so it survives this window being backgrounded.
      window.buildy.onWatchedSourceChanged((_: unknown, d: { windowName: string | null; message: string | null }) => {
        setWatchedSource(d.windowName, d.message)
        if (!d.windowName) { clearAnalysis(); window.buildy.hideGuidance() }
      }),
      window.buildy.onCompanionAnswer((_: unknown, d: { question: string; answer: string }) => {
        setLastAnswer(d)
        setMicState('idle')
        // Show the spoken-question answer in the guidance window.
        window.buildy.showGuidanceAnswer(d)
      }),
      window.buildy.onCompanionShutdown(() => window.buildy.voice.stop()),
    ]
    return () => { unsubs.forEach((u) => u()) }
  }, [])

  // ─── Window picker ──────────────────────────────────────────────────

  async function openPicker(): Promise<void> {
    const s = await window.buildy.loadSettings()
    if (!s.hasApiKey) { setNeedsApiKey(true); return }
    setNeedsApiKey(false)
    const wins = await window.buildy.listWindows()
    setWindowList(wins.map((w) => ({ id: w.id, name: w.name, thumbnailBase64: w.thumbnailBase64 })))
    setShowWindowPicker(true)
  }

  async function pickWindow(id: string, name: string): Promise<void> {
    setShowWindowPicker(false)
    clearAnalysis()
    window.buildy.hideGuidance()  // drop any stale guidance from the previous window
    window.buildy.voice.resetDedup()  // fresh watching session can speak anything
    setWatchedSource(name, null)
    await window.buildy.selectWatchSource(id, name)
  }

  // ─── Click-to-talk (MediaRecorder → ElevenLabs STT) ─────────────────

  const startRecording = useCallback(async () => {
    if (!watchedWindowName) return
    setMicError(null)

    try {
      // NOTE: deliberately does NOT stop audio (Invariant 2). Starting the mic
      // while Buildy is talking lets it finish; recording proceeds in parallel.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream

      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' })
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        streamRef.current = null

        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        console.log(`[Mic] Recording complete: ${blob.size} bytes`)

        if (blob.size < 500) {
          console.warn('[Mic] Recording too short')
          setMicState('idle')
          setMicError('Too short — click mic, speak, click again.')
          return
        }

        setMicState('transcribing')

        try {
          const arrayBuffer = await blob.arrayBuffer()
          console.log('[Mic] Sending to ElevenLabs STT...')
          const result = await window.buildy.transcribeAudio(arrayBuffer)

          if (!result.success || !result.text) {
            console.error('[Mic] Transcription failed:', result.error)
            setMicState('idle')
            setMicError(result.error || 'Transcription failed.')
            return
          }

          console.log(`[Mic] Transcribed: "${result.text}"`)
          setMicState('answering')
          setMicError(null)
          await window.buildy.askQuestion(result.text)
        } catch (err) {
          console.error('[Mic] Error:', err)
          setMicState('idle')
          setMicError(`Error: ${String(err).slice(0, 80)}`)
        }
      }

      mediaRecorderRef.current = recorder
      recorder.start()
      setMicState('listening')
      console.log('[Mic] Recording started — click mic again to stop')
    } catch (err) {
      console.error('[Mic] getUserMedia failed:', err)
      setMicState('idle')
      setMicError('Microphone access denied. Allow mic in system settings.')
    }
  }, [watchedWindowName])

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current = null
      console.log('[Mic] Recording stopped — processing...')
    }
  }, [])

  // ─── Handlers ───────────────────────────────────────────────────────

  function onOrbClick(): void {
    if (needsApiKey) { window.buildy.openPanel(); return }
    if (!watchedWindowName) { openPicker(); return }
    // Re-show the latest guidance/answer in the guidance window.
    if (latestAnalysis) window.buildy.showGuidance(latestAnalysis)
    else if (lastAnswer) window.buildy.showGuidanceAnswer(lastAnswer)
    else openPicker()
  }
  function onStop(): void {
    window.buildy.voice.stop(); window.buildy.voice.resetDedup(); stopRecording()
    setMicState('idle'); setAvatarState('idle')
    window.buildy.hideGuidance()
  }
  function onMute(): void { const m = !isMuted; setMuted(m); window.buildy.voice.setMuted(m) }
  function onPause(): void {
    const p = !isPaused; setPaused(p)
    if (p) { window.buildy.pauseCompanion(); window.buildy.voice.stop() } else { window.buildy.resumeCompanion() }
  }
  function onQuiet(): void { const q = !isQuietMode; setQuietMode(q); window.buildy.setQuietMode(q) }
  function onSettings(): void { window.buildy.openPanel() }
  // Re-summon the most recent guidance even when no new analysis has arrived.
  function onShowLast(): void { window.buildy.showLastGuidance() }

  function onMicToggle(): void {
    if (micState === 'listening') { stopRecording(); return }
    if (micState !== 'idle') return // don't interrupt transcribing/answering
    startRecording()
  }

  // ─── Render ─────────────────────────────────────────────────────────

  const watchLabel = needsApiKey
    ? 'click orb to set up API key'
    : watchedSourceMessage
      ? watchedSourceMessage
      : watchedWindowName
        ? watchedWindowName
        : 'click orb to pick a window'

  const micLabel = micState === 'listening' ? 'listening...'
    : micState === 'transcribing' ? 'transcribing...'
    : micState === 'answering' ? 'thinking...'
    : micError ? micError
    : null

  // Map the existing companion/mic state to a mascot pose (presentational only).
  const mascotState: MascotState =
    micState === 'listening' ? 'listening'
    : avatarState === 'speaking' ? 'speaking'
    : avatarState === 'thinking' || micState === 'transcribing' || micState === 'answering' ? 'thinking'
    : watchedWindowName ? 'watching'
    : 'idle'

  return (
    <div style={S.root}>
      <div style={S.drag} />

      <div
        style={S.mascotWrap}
        onClick={onOrbClick}
        onContextMenu={(e) => { e.preventDefault(); openPicker() }}
        title="Click to interact — right-click to pick a window"
      >
        <Mascot state={mascotState} size={120} />
      </div>

      <div style={S.watchLabel}>{watchLabel}</div>

      {/* Control pill */}
      <div style={S.pill}>
        <Btn icon={stopIcon} onClick={onStop} active={false} title="Stop" />
        <Btn icon={isMuted ? muteOnIcon : muteOffIcon} onClick={onMute} active={isMuted} title={isMuted ? 'Unmute' : 'Mute'} />
        <Btn icon={isPaused ? playIcon : pauseIcon} onClick={onPause} active={isPaused} title={isPaused ? 'Resume' : 'Pause'} />
        <Btn icon={quietIcon} onClick={onQuiet} active={isQuietMode} title={isQuietMode ? 'Normal' : 'Quiet'} />
        <div style={S.pillDivider} />
        <MicBtn
          micState={micState}
          onClick={onMicToggle}
          disabled={!watchedWindowName}
        />
        <Btn icon={showLastIcon} onClick={onShowLast} active={false} title="Show last guidance" />
        <Btn icon={monitorIcon} onClick={openPicker} active={false} title="Pick window" />
        <Btn icon={gearIcon} onClick={onSettings} active={false} title="Settings" />
      </div>

      {/* Mic state indicator */}
      {micLabel && (
        <div style={{
          ...S.micBadge,
          color: micError ? '#FF453A' : '#FF6B2B',
          animation: micState !== 'idle' && !micError ? 'pulse 1.2s ease-in-out infinite' : 'none',
        }}>
          {micLabel}
        </div>
      )}

      {/* Window picker — full-window overlay (guidance lives in its own window now) */}
      {showWindowPicker && (
        <div style={S.picker}>
          <div style={S.pickerHead}>Pick a window to watch</div>
          <div style={S.pickerScroll}>
            {windowList.map((w) => (
              <button key={w.id} onClick={() => pickWindow(w.id, w.name)} style={S.pickerRow}>
                <img src={`data:image/jpeg;base64,${w.thumbnailBase64}`} style={S.pickerThumb} alt="" />
                <span style={S.pickerName}>{trunc(w.name, 28)}</span>
              </button>
            ))}
          </div>
          <button onClick={() => setShowWindowPicker(false)} style={S.pickerCancel}>Cancel</button>
        </div>
      )}
    </div>
  )
}

// ─── Small control button ────────────────────────────────────────────────────

function Btn({ icon, onClick, active, title }: { icon: string; onClick: () => void; active: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      style={{ ...S.btn, ...(active ? S.btnActive : {}) }}
      title={title}
      dangerouslySetInnerHTML={{ __html: icon }}
    />
  )
}

// ─── Mic button (click to start, click to stop) ─────────────────────────────

function MicBtn({ micState, onClick, disabled }: { micState: MicState; onClick: () => void; disabled: boolean }) {
  const isActive = micState === 'listening'
  const isBusy = micState === 'transcribing' || micState === 'answering'

  return (
    <button
      onClick={disabled || isBusy ? undefined : onClick}
      style={{
        ...S.btn,
        ...(isActive ? S.micActive : isBusy ? S.micBusy : {}),
        opacity: disabled ? 0.3 : 1,
        cursor: disabled || isBusy ? 'not-allowed' : 'pointer',
      }}
      title={
        isActive ? 'Click to stop'
        : isBusy ? 'Processing...'
        : disabled ? 'Pick a window first'
        : 'Click to talk'
      }
      dangerouslySetInnerHTML={{ __html: micIcon }}
    />
  )
}

// ─── SVG icons ───────────────────────────────────────────────────────────────

const stopIcon = '<svg width="18" height="18" viewBox="0 0 8 8" fill="currentColor"><rect width="8" height="8" rx="1.5"/></svg>'
const muteOffIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M19 4.9a10 10 0 010 14.1M15.5 8.5a5 5 0 010 7"/></svg>'
const muteOnIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="22" y1="9" x2="16" y2="15"/><line x1="16" y1="9" x2="22" y2="15"/></svg>'
const pauseIcon = '<svg width="18" height="18" viewBox="0 0 8 8" fill="currentColor"><rect x="0" y="0" width="2.5" height="8" rx="0.5"/><rect x="5.5" y="0" width="2.5" height="8" rx="0.5"/></svg>'
const playIcon = '<svg width="18" height="18" viewBox="0 0 8 8" fill="currentColor"><polygon points="1,0 8,4 1,8"/></svg>'
const quietIcon = '<svg width="18" height="18" viewBox="0 0 10 10"><text x="5" y="8" text-anchor="middle" font-size="8" font-weight="700" fill="currentColor">Q</text></svg>'
const micIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="1" width="6" height="12" rx="3"/><path d="M19 10v2a7 7 0 01-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>'
const monitorIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>'
// Message-square (lucide-style) — re-show the last guidance panel.
const showLastIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>'
const gearIcon = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>'

function trunc(t: string, n: number): string { return t.length > n ? t.slice(0, n - 1) + '\u2026' : t }

// ─── Styles ──────────────────────────────────────────────────────────────────

const S = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    padding: '0 10px 10px',
    gap: 0,
    background: 'transparent',
  },
  mascotWrap: {
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    // Drag the whole window from the mascot; the button pill opts out below.
    WebkitAppRegion: 'drag' as unknown as string,
  },
  drag: {
    width: '100%',
    height: 14,
    WebkitAppRegion: 'drag' as unknown as string,
    cursor: 'grab',
    flexShrink: 0,
  },
  watchLabel: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: 500,
    color: 'rgba(255,255,255,0.7)',
    letterSpacing: '0.02em',
    textAlign: 'center' as const,
    maxWidth: 240,
    lineHeight: 1.3,
    flexShrink: 0,
    textShadow: '0 2px 10px rgba(0,0,0,0.9)',
    // Wrap long text, then truncate at 3 lines (no mid-word cutoff with "...")
    overflowWrap: 'break-word' as const,
    wordBreak: 'break-word' as const,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical' as const,
    overflow: 'hidden',
  },
  pill: {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    marginTop: 8,
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 999,
    padding: '7px 9px',
    boxShadow: '0 2px 12px rgba(0,0,0,0.35)',
    flexShrink: 0,
    // Keep buttons clickable — exclude the pill from the window drag region.
    WebkitAppRegion: 'no-drag' as unknown as string,
  },
  pillDivider: {
    width: 1,
    height: 14,
    background: 'rgba(255,255,255,0.08)',
    margin: '0 2px',
    flexShrink: 0,
  },
  btn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 28,
    height: 28,
    borderRadius: 8,
    background: 'transparent',
    color: 'rgba(255,255,255,0.35)',
    border: 'none',
    cursor: 'pointer',
    padding: 0,
    transition: 'color 0.15s, background 0.15s',
  },
  btnActive: {
    background: 'rgba(255,107,43,0.15)',
    color: '#FF6B2B',
  },
  micActive: {
    background: 'rgba(255,69,58,0.25)',
    color: '#FF453A',
  },
  micBusy: {
    background: 'rgba(255,159,10,0.15)',
    color: '#FF9F0A',
  },
  micBadge: {
    marginTop: 4,
    fontSize: 9,
    fontWeight: 600,
    letterSpacing: '0.03em',
    textAlign: 'center' as const,
    maxWidth: 260,
  },
  picker: {
    // Full-window overlay — the compact mascot window has no room to stack it.
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(20,20,22,0.97)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 14,
    padding: 12,
    display: 'flex',
    flexDirection: 'column' as const,
    backdropFilter: 'blur(24px)',
    WebkitBackdropFilter: 'blur(24px)',
    boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
    animation: 'bubbleIn 0.2s ease-out',
    zIndex: 50,
    WebkitAppRegion: 'no-drag' as unknown as string,
  },
  pickerHead: {
    fontSize: 10,
    fontWeight: 600,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 6,
    letterSpacing: '0.02em',
  },
  pickerScroll: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 2,
    flex: 1,
    minHeight: 0,
    overflowY: 'auto' as const,
  },
  pickerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    padding: '4px 6px',
    borderRadius: 8,
    cursor: 'pointer',
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.04)',
    textAlign: 'left' as const,
    width: '100%',
    transition: 'background 0.1s',
  },
  pickerThumb: {
    width: 44,
    height: 28,
    borderRadius: 4,
    objectFit: 'cover' as const,
    flexShrink: 0,
    border: '1px solid rgba(255,255,255,0.06)',
  },
  pickerName: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.6)',
    lineHeight: 1.3,
  },
  pickerCancel: {
    marginTop: 4,
    fontSize: 9,
    color: 'rgba(255,255,255,0.2)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    width: '100%',
    textAlign: 'center' as const,
    padding: 3,
  },
}
