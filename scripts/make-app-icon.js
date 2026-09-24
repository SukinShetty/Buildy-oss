// make-app-icon.js — one-off installer/app icon generator (Phase 9).
// The My Buildy wordmark (src/renderer/src/assets/mybuildy-logo.png) is a 1536x1024
// wordmark banner: a rounded orange mascot badge + white "My Buildy" text on a
// black background. A letterboxed banner makes a terrible app icon, so this
// script extracts the BADGE:
//
//   1. find the bounding box of orange-ish pixels (the badge; the white
//      wordmark text never matches),
//   2. crop it with a small margin,
//   3. flood-fill from the crop corners, turning the connected near-black
//      background transparent (the dark pixels INSIDE the badge — eyes,
//      antenna — are not edge-connected and survive),
//   4. pad to square (transparent), resize to 512x512, write build/icon.png.
//
// electron-builder converts that PNG into the multi-size Windows .ico itself,
// and the same file ships as resources/icon.png for the window/tray icon.
//
// Run with Electron (same pattern as resize-mascot.js — no npm dependency):
//
//   npx electron scripts/make-app-icon.js

const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync, mkdirSync, statSync } = require('fs')
const { join } = require('path')

const SOURCE = join(__dirname, '..', 'src', 'renderer', 'src', 'assets', 'mybuildy-logo.png')
const OUT_DIR = join(__dirname, '..', 'build')
const OUT = join(OUT_DIR, 'icon.png')
const SIZE = 512

// Bitmap helpers — nativeImage bitmaps are BGRA, row-major.
const px = (bmp, w, x, y) => {
  const i = (y * w + x) * 4
  return { b: bmp[i], g: bmp[i + 1], r: bmp[i + 2], a: bmp[i + 3] }
}
const isOrange = ({ r, g, b }) => r > 140 && b < 110 && r > b + 60 && g > 40 && g < r
const isDarkBg = ({ r, g, b }) => Math.max(r, g, b) < 60

app.whenReady().then(() => {
  const logo = nativeImage.createFromBuffer(readFileSync(SOURCE))
  if (logo.isEmpty()) throw new Error(`Could not decode ${SOURCE}`)
  const { width, height } = logo.getSize()
  console.log(`source: ${width}x${height} (${(statSync(SOURCE).size / 1024).toFixed(0)} KB)`)
  const bmp = logo.toBitmap()

  // 1. Bounding box of the orange badge.
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (isOrange(px(bmp, width, x, y))) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('No orange badge found in the logo')

  // 2. Small margin so the badge's antialiased edge is not clipped.
  const margin = Math.round((maxX - minX) * 0.03)
  minX = Math.max(0, minX - margin)
  minY = Math.max(0, minY - margin)
  maxX = Math.min(width - 1, maxX + margin)
  maxY = Math.min(height - 1, maxY + margin)
  const cw = maxX - minX + 1
  const ch = maxY - minY + 1
  console.log(`badge: ${cw}x${ch} at (${minX},${minY})`)

  // Copy the crop into its own BGRA buffer.
  const crop = Buffer.alloc(cw * ch * 4)
  for (let y = 0; y < ch; y++) {
    const srcStart = ((y + minY) * width + minX) * 4
    bmp.copy(crop, y * cw * 4, srcStart, srcStart + cw * 4)
  }

  // 3. Flood fill from the corners: edge-connected near-black -> transparent.
  const visited = new Uint8Array(cw * ch)
  const stack = []
  for (const [sx, sy] of [[0, 0], [cw - 1, 0], [0, ch - 1], [cw - 1, ch - 1]]) stack.push(sx + sy * cw)
  while (stack.length > 0) {
    const idx = stack.pop()
    if (visited[idx]) continue
    visited[idx] = 1
    const x = idx % cw
    const y = (idx - x) / cw
    if (!isDarkBg(px(crop, cw, x, y))) continue
    crop.fill(0, idx * 4, idx * 4 + 4) // transparent
    if (x > 0) stack.push(idx - 1)
    if (x < cw - 1) stack.push(idx + 1)
    if (y > 0) stack.push(idx - cw)
    if (y < ch - 1) stack.push(idx + cw)
  }

  // 4. Pad to square (transparent), then resize to SIZE x SIZE.
  const side = Math.max(cw, ch)
  const canvas = Buffer.alloc(side * side * 4)
  const offX = Math.floor((side - cw) / 2)
  const offY = Math.floor((side - ch) / 2)
  for (let y = 0; y < ch; y++) {
    crop.copy(canvas, ((y + offY) * side + offX) * 4, y * cw * 4, (y + 1) * cw * 4)
  }
  const icon = nativeImage
    .createFromBitmap(canvas, { width: side, height: side })
    .resize({ width: SIZE, height: SIZE, quality: 'best' })

  mkdirSync(OUT_DIR, { recursive: true })
  writeFileSync(OUT, icon.toPNG())
  console.log(`wrote ${OUT}: ${SIZE}x${SIZE} (${(statSync(OUT).size / 1024).toFixed(0)} KB)`)
  app.quit()
}).catch((err) => {
  console.error(err)
  app.exit(1)
})
