# Voice Cutoff — Runtime Evidence

> This time the analysis is backed by **actual headless Electron runs** (this repo's
> Electron 31 launches headlessly in the sandbox), not static guessing. Four
> harnesses exercised the real playback path. Raw logs below.

## What was tested and PROVEN to work (natural `ended`, full playback)

### Harness 1 — hidden window, 3s clip, current voice-player config
`BrowserWindow({show:false, focusable:false, transparent:true, webPreferences:{backgroundThrottling:false}})`, played a 3s WAV:
```
play() RESOLVED ... timeupdate t=0.02 → 0.30 → ... → 2.94 → 3.00 ; PAUSE t=3.00 ; ENDED t=3.00
```
→ A hidden window with `backgroundThrottling:false` plays a multi-second clip to a **natural end**. **Rules out** the window/throttling/visibility theory and audio-element GC (it's module-level).

### Harness 2 + 3 — Web Speech in the hidden window, incl. forced GC
Replicated the app's exact `onPlayTts` pattern (local utterance) and ran `--expose-gc` with `gc()` every 400ms:
```
start ... boundary 0 → 4 → ... → 183 ... END charLen=189  (at ~10.6s)
```
→ Web Speech speaks the **full 189 chars to a natural END even under aggressive GC**. **Rules out** the "Chrome garbage-collects the unreferenced utterance" theory on this platform.

### Harness 4 — END-TO-END with the REAL built renderer + REAL voice-queue (TTS path)
Loaded `out/renderer/index.html?voice=true` with the real `out/preload/index.js`, drove it through the real `voice-queue.ts` (synth→null = Web Speech). Enqueued a 129-char, 3-sentence analysis, then a SECOND analysis mid-playback:
```
New item "A1" (1 chunks) ; speak() A1#0 ; tts start ; boundary 0→120 ; tts ENDED A1#0 (10.6s)
=== enqueue ANALYSIS-2 (mid-playback) ===     ← arrives at 3.3s, while A1 is speaking
Promoting pending "A2" ; speak() A2#0 ; boundary 0→55 ; tts ENDED A2#0
```
→ The full text is spoken to a **natural end**, and a new analysis arriving mid-playback is **correctly queued as pending and played AFTER** — it does NOT interrupt. The `voice:ctl-stop` / `voice:ctl-mute` channels **never fired**. **Rules out** the queue logic and any automatic interrupt-on-new-analysis.

### Harness 5 — END-TO-END MP3 path through the REAL renderer
Generated a valid 4s silent MP3, sent it via `voice:play-audio` to the real renderer:
```
play() RESOLVED ; canplaythrough dur=3.99 ; timeupdate 0.07 → 3.78 ; PAUSE t=3.99 (stack: audio.onpause) ; ENDED t=3.99
```
→ The MP3 path also plays to a **natural end**; the only `PAUSE` is the natural end-of-stream one (not an external `stopCurrent`).

## Conclusion from the evidence

**The current voice architecture does not cut audio off.** In every reproducible
scenario — MP3 and Web Speech, single and multi-sentence, with a competing analysis
mid-playback — the real renderer + real queue play to a **natural `ended`**. The
six previously-suspected causes (renderer throttling, audio GC, utterance GC, queue
races, system-TTS bypassing the lock, per-utterance `cancel()`) are all **ruled out
by runtime evidence**.

Two things remain, and they explain why this bug has been so slippery:

1. **The hidden voice window's console was INVISIBLE.** It is never shown and has no
   devtools, so for six sessions nobody could see what it actually did. That is the
   single biggest reason the real behaviour was never observed. FIX: the voice
   window's `console-message` is now forwarded to the main process stdout, so
   `npm run dev` prints `[Voice-Window] …` lines (full instrumentation: timestamps,
   `timeupdate`, `PAUSE`+stack, `boundary`, `ENDED`, `ERROR`, and every
   `stopCurrent`+stack). One real run will now pinpoint the exact cut.

2. **The one cause NOT testable here: a permanently `show:false` window's audio
   being suspended by the OS/Chromium media session on a real audio device.** This
   sandbox has no audio device (Chromium used a null sink on a real-time clock — why
   playback advanced perfectly), so it cannot reproduce OS-level media suspension of
   a never-painted window. The standard Electron remedy is to make the audio window
   a real, **offscreen-shown** window rather than `show:false`. Applied as a
   defensive fix (with `autoplayPolicy:'no-user-gesture-required'`).

## Honest status

I am **not declaring this "fixed"** without a proof-run on a real machine, per the
brief. What I can prove: the code path is correct in every reproducible scenario.
What I changed: (a) made the hidden window's logs visible, (b) hardened the window
config against the one untestable failure mode. The next `npm run dev` will either
show natural `ENDED` (fixed) or print the exact `PAUSE`/`ERROR`/truncation that
finally identifies an environment-specific cause.
