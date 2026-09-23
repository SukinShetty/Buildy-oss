// resize-mascot.js — one-off asset shrink for the mascot poses.
// Downscales the four 1024x1536 pose PNGs in src/renderer/src/assets/ to
// 512x768 (alpha preserved) and rewrites them in place.
//
// Run with Electron so we can use Chromium's high-quality resampler via
// nativeImage — no extra npm dependency needed:
//
//   npx electron scripts/resize-mascot.js
//
// buildy-logo.png is deliberately untouched (tray/app icon).

const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync, statSync } = require('fs')
const { join } = require('path')

const ASSETS = join(__dirname, '..', 'src', 'renderer', 'src', 'assets')
const POSES = ['buildy-idle.png', 'buildy-watching.png', 'buildy-thinking.png', 'buildy-speaking.png']
const TARGET = { width: 512, height: 768 }

app.whenReady().then(() => {
  for (const name of POSES) {
    const path = join(ASSETS, name)
    const before = statSync(path).size
    const img = nativeImage.createFromBuffer(readFileSync(path))
    const { width, height } = img.getSize()
    if (width === TARGET.width && height === TARGET.height) {
      console.log(`${name}: already ${width}x${height}, skipping`)
      continue
    }
    const resized = img.resize({ ...TARGET, quality: 'best' })
    writeFileSync(path, resized.toPNG())
    const after = statSync(path).size
    console.log(
      `${name}: ${width}x${height} (${(before / 1024).toFixed(0)} KB) -> ` +
      `${TARGET.width}x${TARGET.height} (${(after / 1024).toFixed(0)} KB)`
    )
  }
  app.quit()
}).catch((err) => {
  console.error(err)
  app.exit(1)
})
