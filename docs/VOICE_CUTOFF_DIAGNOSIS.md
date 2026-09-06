# Voice Cutoff — Forensic Diagnosis

> Written **before** any fix, per the investigation brief. This documents the
> actual root cause and the audit that found it.

## TL;DR — the actual cause

**Chromium background throttling of the companion renderer.**

Audio is played in the **companion window's renderer** (`VoiceGuidance.ts`). That
`BrowserWindow` is created **without `backgroundThrottling: false`**, so it defaults
to `true`. The moment the user clicks the terminal they're building in (Claude
Code), the small always‑on‑top companion window **loses focus / is backgrounded /
occluded**, and Chromium throttles that renderer — suspending/stuttering its media
playback and timers. The clip is cut off mid‑sentence.

This matches the user's report *exactly*: "the spoken response stops abruptly …
**when the terminal changes**, a new screenshot/observation is processed, **the UI
re‑renders**, or another TTS request begins." All of those coincide with the
companion window losing foreground.

Crucially, the previous fixes (unified queue + single lock + module‑level audio
element) could **never** have fixed this: the bug is not GC of the audio object and
not the queue logic — it is the **entire renderer process being throttled** because
its window is backgrounded. A module‑level reference doesn't help when the whole
renderer is suspended.

The fix direction (Invariant 1) is therefore correct: **move audio ownership to a
dedicated main‑process‑owned hidden window created with `backgroundThrottling:
false`** that is never focused and never affected by UI churn.

---

## 1. Components / modules that touch audio

| File | Role |
|------|------|
| `src/renderer/src/companion/VoiceGuidance.ts` | Owns ALL playback: module‑level `currentAudio: HTMLAudioElement` (L27), module‑level `audioQueue` (L36), `new Audio()` (L179), Web Speech (`speechSynthesis.speak`). Unified serial queue + lock. |
| `src/renderer/src/companion/CompanionApp.tsx` | The ONLY consumer. Imports `playAudio, speakSystemTTS, stopAllAudio, resetSpeechDedup` (L9). Calls `playAudio` in `onCompanionAudio` (L57) and `speakSystemTTS` in `onCompanionSpeak` (L69). |
| `src/main/analysis-loop.ts` | `speakText()` synthesizes ElevenLabs MP3 (or falls back) and sends `COMPANION_AUDIO`/`COMPANION_SPEAK` IPC to the companion (L525/L539). |
| `src/main/ai/elevenlabs-tts.ts` | `synthesizeSpeech()` → base64 MP3 via `fetchWithTimeout`. |

The audio element is created **at module scope** (`VoiceGuidance.ts:27,179`), NOT in
a `useRef` inside a component. So **culprit #1 (audio destroyed on unmount/re‑render)
is RULED OUT** — the object survives re‑renders. The problem is the *renderer
itself* being throttled, which no module‑level reference can prevent.

## 2. What causes the companion component to re‑render

`CompanionApp` re‑renders on every `setAvatarState` / `setLatestAnalysis` /
`setLastSpokenText` / `setWatchedSource` etc. — i.e. on **every** analysis and state
ping. But re‑renders do **not** touch `currentAudio` (module scope). Re‑render is a
*correlate* of the cutoff (new analysis → re‑render → also the window is likely
backgrounded), not the mechanism.

## 3. Every `useEffect` cleanup in those files

- `CompanionApp.tsx:87` — IPC‑listener effect cleanup: `unsubs.forEach(u => u()); stopAllAudio()`.
  - Deps array is `[]`, so this runs **only on unmount** (and once in React StrictMode dev). It does **not** fire per analysis in production. **Ruled out** as the per‑analysis cause.
- No other audio‑touching `useEffect` cleanups exist.

## 4. ElevenLabs fetch — is a prior request aborted by a new one?

**No.** `src/main/ai/fetch-with-timeout.ts:14` creates a **fresh `AbortController`
per call**; the only `.abort()` is its own per‑request timeout (60s). There is no
shared/module AbortController, and `synthesizeSpeech` is `await`‑ed sequentially in
`speakText`. **Culprit #5 (streaming aborted by next request) is RULED OUT.**

## 5. Path trace: new analysis → audio plays

1. `analysis-loop.runOneAnalysisCycle` captures + analyzes.
2. Sends `COMPANION_ANALYSIS` → companion renderer (`onCompanionAnalysis`) →
   `setLatestAnalysis` + `window.buildy.showGuidance` (re‑render + guidance window show).
3. If a significant change, `speakText` synthesizes and sends `COMPANION_AUDIO`
   (or `COMPANION_SPEAK`) → companion renderer.
4. `onCompanionAudio` (`CompanionApp.tsx:53`) → `playAudio(base64, text)` in
   `VoiceGuidance.ts` → enqueue → `new Audio()` → `play()`.
5. **Playback happens inside the companion renderer.** While it plays, steps 1–2
   keep firing every ~10s and the user is interacting with the terminal — so the
   companion window is backgrounded and **throttled**, suspending the clip.

## 6. Audio object scope

Module‑level (`VoiceGuidance.ts:27,179`) → **safe from GC/unmount**. Confirms the
issue is renderer throttling, not object lifetime.

## 7. Every place that pauses / nulls / stops audio (file:line)

| Location | Call | Triggered by | Legit? |
|----------|------|--------------|--------|
| `VoiceGuidance.ts:171` | `currentAudio?.pause()` | per‑clip safety timeout | yes |
| `VoiceGuidance.ts:303` | `currentAudio.pause()` | `stopAllAudio()` | only if caller is legit |
| `VoiceGuidance.ts:335` | `currentAudio = null` | `cleanupAudio()` in `done()` | yes |
| `CompanionApp.tsx:85` | `stopAllAudio()` | app shutdown | yes |
| `CompanionApp.tsx:87` | `stopAllAudio()` | unmount only (`[]` effect) | yes |
| `CompanionApp.tsx:117` | `stopAllAudio()` | **start recording (mic)** | **to be REMOVED per Invariant 2** |
| `CompanionApp.tsx:197` | `stopAllAudio()` | Stop Watching | yes (explicit) |
| `CompanionApp.tsx:201` | `stopAllAudio()` | Mute | yes (explicit) |
| `CompanionApp.tsx:204` | `stopAllAudio()` | Pause | yes (explicit) |

None of these fire on "new analysis." So the cutoff is **not** an inappropriate
stop call — it is the renderer being throttled while backgrounded.

---

## Which invariant is the actual cause

**Invariant 1.** Audio is owned by the renderer, whose `BrowserWindow` is subject to
`backgroundThrottling` when it loses foreground. Moving playback into a dedicated
main‑owned **hidden window with `backgroundThrottling: false`** (never focused,
never re‑rendered by app state, never closed during a session) makes playback immune
to the companion window's focus/visibility and to UI re‑renders.

## Fix plan (implemented after this doc)

1. `src/main/voice-queue.ts` — pure, electron‑free queue: sentence‑safe chunking,
   single lock, pending‑merge (keep only latest next), critical override, dedup.
   Unit‑tested.
2. `src/main/voice-player.ts` — electron glue: a **hidden BrowserWindow**
   (`backgroundThrottling: false`, `show:false`, never focused) that plays one clip
   at a time; ElevenLabs synthesis per chunk; drives `VoiceQueue`.
3. `src/renderer/src/voice/VoicePlayer.tsx` — dumb player UI routed by `?voice=true`:
   plays exactly what main tells it, reports `ended`. No queue.
4. `analysis-loop.speakText` → `voicePlayer.enqueueSpeech(...)` instead of sending
   audio to the companion.
5. Companion renderer stops owning playback; mic no longer interrupts audio.
6. `GuidancePanel` highlights the currently‑spoken sentence (Invariant 6).
