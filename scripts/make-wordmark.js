// make-wordmark.js — one-off README/brand wordmark generator (rename to My Buildy).
// Renders the 1536x1024 banner used at the top of the README: the orange mascot
// badge (build/icon.png, produced by make-app-icon.js) plus a white "My Buildy"
// wordmark on a near-black background, and writes it to both logo locations:
//   docs/mybuildy-logo.png                   (README header)
//   src/renderer/src/assets/mybuildy-logo.png (source for make-app-icon.js)
//
// Rendered with an offscreen Electron window, so there is no npm dependency:
//
//   npx electron scripts/make-wordmark.js
//
// Order: build/icon.png is the source of truth for the badge. make-app-icon.js
// originally cut that badge out of the old wordmark; re-running it on this
// wordmark is optional (it finds the same orange badge) and never required.

const { app, BrowserWindow, nativeImage } = require('electron')
const { readFileSync, writeFileSync } = require('fs')
const { join } = require('path')

const ROOT = join(__dirname, '..')
const BADGE = join(ROOT, 'build', 'icon.png')
const OUTPUTS = [
  join(ROOT, 'docs', 'mybuildy-logo.png'),
  join(ROOT, 'src', 'renderer', 'src', 'assets', 'mybuildy-logo.png'),
]
const WIDTH = 1536
const HEIGHT = 1024

const badgeDataUrl = `data:image/png;base64,${readFileSync(BADGE).toString('base64')}`

const html = `<!doctype html><html><head><style>
  html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; }
  body {
    background: radial-gradient(ellipse at 50% 50%, #15151a 0%, #09090b 70%);
    display: flex; align-items: center; justify-content: center; gap: 72px;
  }
  img { width: 380px; height: 380px; filter: drop-shadow(0 0 36px rgba(255, 140, 0, 0.45)); }
  span {
    color: #fff; font: 800 190px/1 "Segoe UI", "Helvetica Neue", Arial, sans-serif;
    letter-spacing: -6px; white-space: nowrap;
  }
</style></head><body><img src="${badgeDataUrl}" alt=""><span>My Buildy</span></body></html>`

app.disableHardwareAcceleration()
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: WIDTH,
    height: HEIGHT,
    show: false,
    useContentSize: true,
    webPreferences: { offscreen: true },
  })
  await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
  await new Promise((resolve) => setTimeout(resolve, 500)) // let fonts + image paint
  let image = await win.webContents.capturePage()
  const size = image.getSize()
  if (size.width !== WIDTH || size.height !== HEIGHT) {
    image = image.resize({ width: WIDTH, height: HEIGHT, quality: 'best' })
  }
  const png = image.toPNG()
  // Validate BEFORE overwriting the committed logos.
  if (nativeImage.createFromBuffer(png).isEmpty()) throw new Error('rendered wordmark is empty')
  for (const out of OUTPUTS) {
    writeFileSync(out, png)
    console.log(`wrote ${out} (${WIDTH}x${HEIGHT}, ${(png.length / 1024).toFixed(0)} KB)`)
  }
  app.quit()
}).catch((error) => {
  console.error(error)
  app.exit(1)
})
