// make-icns.js — one-off macOS app icon generator (build/icon.icns).
// Packs build/icon.png (512x512, from make-app-icon.js) into an .icns file:
// an "icns" container of PNG-encoded entries at the sizes macOS asks for.
// No iconutil (macOS-only) or npm dependency — run it anywhere with Electron:
//
//   npx electron scripts/make-icns.js
//
// Layout: 'icns' + total length (u32 BE), then per entry: 4-byte type +
// entry length incl. its 8-byte header (u32 BE) + PNG bytes.

const { app, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const SOURCE = join(__dirname, '..', 'build', 'icon.png')
const OUT = join(__dirname, '..', 'build', 'icon.icns')

// type -> pixel size (the @2x types hold the double-resolution bitmap).
const ENTRIES = [
  ['icp4', 16], ['icp5', 32], ['icp6', 64],
  ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024],
  ['ic11', 32], ['ic12', 64], ['ic13', 256], ['ic14', 512],
]

app.whenReady().then(() => {
  const source = nativeImage.createFromBuffer(readFileSync(SOURCE))
  if (source.isEmpty()) throw new Error(`Could not decode ${SOURCE}`)

  const chunks = ENTRIES.map(([type, size]) => {
    const png = source.resize({ width: size, height: size, quality: 'best' }).toPNG()
    const header = Buffer.alloc(8)
    header.write(type, 0, 'ascii')
    header.writeUInt32BE(png.length + 8, 4)
    return Buffer.concat([header, png])
  })
  const body = Buffer.concat(chunks)
  const fileHeader = Buffer.alloc(8)
  fileHeader.write('icns', 0, 'ascii')
  fileHeader.writeUInt32BE(body.length + 8, 4)
  writeFileSync(OUT, Buffer.concat([fileHeader, body]))
  console.log(`wrote ${OUT} (${ENTRIES.length} sizes, ${((body.length + 8) / 1024).toFixed(0)} KB)`)
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
