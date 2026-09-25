import { describe, it, expect } from 'vitest'
import {
  BAR_BACKGROUND, ICON_COLOR, ICON_HOVER_COLOR, ICON_HOVER_BACKGROUND, hexToRgb, over, contrastRatio,
} from './robot-theme'

// The bar is almost opaque; check it over the darkest and the brightest desktop.
const DESKTOPS = [{ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }]

describe('robot bar icons pass a normal (4.5:1) contrast check against the dark bar', () => {
  it('near-white icons at rest', () => {
    for (const desktop of DESKTOPS) {
      const bar = over(BAR_BACKGROUND, desktop)
      expect(contrastRatio(hexToRgb(ICON_COLOR), bar)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('orange icons on the hover background', () => {
    for (const desktop of DESKTOPS) {
      const hovered = over(ICON_HOVER_BACKGROUND, over(BAR_BACKGROUND, desktop))
      expect(contrastRatio(hexToRgb(ICON_HOVER_COLOR), hovered)).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('the old dim grey (35% white on a 50% black bar) failed the same check', () => {
    const oldBar = over({ r: 0, g: 0, b: 0, a: 0.5 }, { r: 255, g: 255, b: 255 })
    const oldIcon = over({ r: 255, g: 255, b: 255, a: 0.35 }, oldBar)
    expect(contrastRatio(oldIcon, oldBar)).toBeLessThan(4.5)
  })
})
