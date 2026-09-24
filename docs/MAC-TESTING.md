# Testing My Buildy on a Mac

This is the first time My Buildy runs on a real Mac. Everything below was built and unit-tested on macOS in CI, but **nobody has clicked through it on a Mac yet** — that is what this checklist is for. It takes about 20 minutes.

You will need: a Mac (Apple Silicon or Intel), a terminal app (Terminal, iTerm2, …) running an AI coding agent — [Claude Code](https://docs.anthropic.com/en/docs/claude-code) is the one tested so far, but any terminal agent or a plain shell works for this checklist — and an API key for Anthropic, OpenAI, Google Gemini or OpenRouter.

---

## 1. Install

1. From the release page, download the DMG for your Mac:
   - **Apple Silicon** (Apple menu > About This Mac says "Chip: Apple M…"): `MyBuildy-0.1.0-arm64.dmg`
   - **Intel** ("Processor: Intel…"): `MyBuildy-0.1.0-x64.dmg`
2. Open the DMG and drag **MyBuildy** into **Applications**.
3. In Applications, **right-click (or Control-click) MyBuildy > Open**, then click **Open** in the dialog. (The app is not notarized by Apple, so a normal double-click is blocked the first time. After this once, double-click works.)

### If macOS says "MyBuildy is damaged and can't be opened"

That is macOS's download quarantine on an app that isn't notarized — the file is fine. Open **Terminal** and run:

```bash
xattr -dr com.apple.quarantine /Applications/MyBuildy.app
```

Then open MyBuildy again.

---

## 2. The three macOS permissions

macOS will ask for these. If one is missing, My Buildy shows a message on the mascot and in its guidance panel saying exactly what to turn on, with an **Open System Settings** button that goes straight to the right place. In System Settings the app may be listed as **MyBuildy** (one word).

| Permission | Where | Needed for | Restart needed? |
|---|---|---|---|
| **Screen Recording** | System Settings > Privacy & Security > Screen Recording | Watching a window (without it macOS hands My Buildy blank pictures) | **Yes — quit My Buildy (right-click the Dock icon > Quit, or the menu bar icon > Quit My Buildy) and open it again.** macOS ignores the permission until the app restarts. |
| **Accessibility** | System Settings > Privacy & Security > Accessibility | **Send** (typing Cmd+V and Return into your terminal) | No |
| **Automation → System Events** | System Settings > Privacy & Security > Automation > MyBuildy > System Events | **Send** (same reason — macOS asks "MyBuildy wants to control System Events" the first time; click **OK**) | No |

macOS may also ask whether MyBuildy can use the **"MyBuildy Safe Storage"** keychain item when you save your API key. That is where your key is encrypted — choose **Always Allow**.

**To quit** (needed after granting Screen Recording): press **Cmd+Q** while My Buildy is the active app, or right-click the Dock icon > **Quit**, or use the menu bar icon > **Quit My Buildy**. Check the Dock: the icon's dot should disappear.

**If you install a newer build later:** the app is ad-hoc signed, so macOS treats each build as a new app and forgets these permissions, even if the switch in System Settings still looks **on**. In each list, select MyBuildy, click **−**, then add it again with **+** (or toggle it back on). The Keychain may ask again too.

---

## 3. If something fails: what to send

For any step that doesn't match what it says you should see, send:

1. **Which step**, and what you saw instead.
2. **A screenshot** (Cmd+Shift+4, then drag over the area; it lands on your Desktop).
3. **Your Mac**: Apple menu > About This Mac — the chip (Apple M… or Intel) and the macOS version.
4. **The log**, captured like this:
   1. Quit My Buildy (menu bar icon > Quit My Buildy).
   2. In Terminal, run:

      ```bash
      /Applications/MyBuildy.app/Contents/MacOS/MyBuildy 2>&1 | tee ~/Desktop/mybuildy-log.txt
      ```

   3. Repeat the failing step, then quit My Buildy and send **`mybuildy-log.txt`** from your Desktop. It contains lines like `[Send] …`, `[Watch] …`, `[Companion] …` and never contains your API key. (Keep this Terminal window out of the way — don't pick it as the window to watch.)

---

## 4. Checklist

Tick each one. "You should see" is what passing looks like.

**1. The app opens.**
Open MyBuildy from Applications.
*You should see:* the orange robot mascot floating on screen, the **Settings** window open (first launch), a MyBuildy icon in the Dock and a small orange icon in the menu bar. The mascot's label says **"Set me up: click the gear"**.
*If not:* send the log (step 3 above).

**2. The mascot floats above a terminal.**
Click your terminal window, then make it full screen (green button, or Ctrl+Cmd+F).
*You should see:* the mascot stays on top of the terminal in both cases, including in full screen. Drag the mascot around by its body; drag it almost off the edge of the screen and let go.
*You should see:* it moves smoothly, and when dropped mostly off-screen it slides back fully on screen. New guidance appearing later never takes keyboard focus away from your terminal.
*If not:* screenshot + which terminal app + whether it was full screen.

**3. Screen Recording: the prompt appears, and capture works after granting.**
Right-click the mascot to open the window picker.
*You should see:* macOS asks to let MyBuildy record the screen (or the picker shows windows without real previews). If watching is refused, the mascot and the guidance panel say **"macOS needs permission to see your screen…"** with an **Open System Settings** button.
Click the button, turn on **MyBuildy** under Screen Recording, then **quit and reopen My Buildy**.
*You should see:* after reopening, the window picker shows real miniature previews of your windows.
*If not:* screenshot of the picker + screenshot of the Screen Recording list in System Settings + the log.

**4. The key saves and the vision check passes.**
In Settings, pick a provider, paste your API key, click Save. If macOS asks about the "MyBuildy Safe Storage" keychain item, choose **Always Allow**.
*You should see:* **Saved** next to the key (the key itself is never shown again), then a live list of models. Pick a model that can see images (the list marks a **Suggested** one; there is no default).
*You should see:* the vision check runs and shows it **passed**.
*If not:* the exact message shown under the model list + the log.

**5. A terminal window can be picked.**
Right-click the mascot, pick your terminal window. Accept the one-time privacy notice (Continue).
*You should see:* the mascot's label changes to the terminal window's title and the mascot looks "watching".
*If not:* the exact label text + the log.

**6. The guidance panel shows an analysis.**
Wait up to ~30 seconds (or type something in the terminal).
*You should see:* a panel appears next to the mascot with an ON TRACK / DRIFTING / BLOCKED pill, a plain-English explanation of what's on screen, and usually a **Prompt to paste** with a **Send** button (it reads **Send to Claude Code** or **Send to Codex** when My Buildy recognises the agent).
*If not:* screenshot + the log.

**7. Send pastes and submits.**
With your agent (or a shell) waiting for input in the watched terminal, click **Send…** in the panel.
- If Accessibility is missing: the panel says **"macOS needs permission to type for you…"** with **Open System Settings**, and macOS shows its own Accessibility prompt. Turn on MyBuildy under Accessibility and click Send again.
- The first successful send makes macOS ask **"MyBuildy wants to control System Events"** — click **OK**. (If you clicked Don't Allow, the panel says so and the button opens Automation settings.)

*You should see:* the terminal comes to the front, the prompt is pasted and submitted (Return pressed) by itself, and the mascot briefly says **Sent**.
*If not:* what happened in the terminal (nothing / pasted but not submitted / pasted into another window) + the log. If you had several windows of the same terminal app open, say so.

**8. A turn-end report arrives.**
After a Send, let your agent (or your shell command) finish its work.
*You should see:* within about 10 seconds of it finishing, a fresh analysis in the guidance panel (and a spoken summary if voice is on). While it is still working, My Buildy stays quiet.
*If not:* roughly how long it took (or never) + the log.

**9. Voice plays.**
Make sure quiet mode is off on the mascot (speaker icon).
*You should see / hear:* the guidance is read aloud — by the macOS system voice, or by ElevenLabs if you added that key in Settings.
*If not:* your Mac's output volume/device + the log.

**10. Delete all data returns to first run.**
Settings > **Delete all My Buildy data** > confirm.
*You should see:* My Buildy restarts to first run: Settings opens, no key saved, no model selected, the mascot says **"Set me up: click the gear"**, and the Memory tab is empty.
*If not:* screenshot + the log.

---

## Known limitation to watch for

If your terminal app has **several windows open**, Send brings the right *app* forward and then tries to raise the watched window by its exact title. If the title changed at that very moment, the paste could land in another window of the same app. If you see that happen, please report it with the log.

Thank you — every "it did something odd" report is useful.
