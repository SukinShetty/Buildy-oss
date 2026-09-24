// after-pack.js — electron-builder afterPack hook (runs before the DMG is made).
// macOS only: ad-hoc sign MyBuildy.app ("codesign --sign -") so it launches on
// Apple Silicon without an Apple Developer certificate, then verify the
// signature so a broken bundle fails the build instead of reaching a tester.
// No notarization: users open it with right-click > Open (see README).
// Windows/Linux builds return immediately.

const { execFileSync } = require('child_process')
const { join } = require('path')

const ENTITLEMENTS = join(__dirname, '..', 'build', 'entitlements.mac.plist')

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  console.log(`[after-pack] ad-hoc signing ${appPath}`)
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', '--entitlements', ENTITLEMENTS, appPath], { stdio: 'inherit' })
  execFileSync('codesign', ['--verify', '--deep', '--strict', '--verbose=2', appPath], { stdio: 'inherit' })
}
