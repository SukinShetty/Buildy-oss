// robot-theme.ts — the robot bar's colours, and the contrast maths that proves
// every icon is readable against the bar (robot-theme.test.ts).

export const BAR_BACKGROUND = { r: 28, g: 28, b: 30, a: 0.98 }   // near-solid dark bar
export const ICON_COLOR = '#F2F2F7'                             // near-white at rest
export const ICON_HOVER_COLOR = '#FF6B2B'                       // brand orange on hover
export const ICON_HOVER_BACKGROUND = { r: 255, g: 107, b: 43, a: 0.12 }

type RGB = { r: number; g: number; b: number }
type RGBA = RGB & { a: number }

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.replace('#', ''), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/** Paint a translucent colour over an opaque one. */
export function over(top: RGBA, bottom: RGB): RGB {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
  }
}

function channel(v: number): number {
  const c = v / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

export function luminance({ r, g, b }: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio (1–21). */
export function contrastRatio(a: RGB, b: RGB): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

const rgba = (c: RGBA): string => `rgba(${c.r},${c.g},${c.b},${c.a})`
export const BAR_BACKGROUND_CSS = rgba(BAR_BACKGROUND)
export const ICON_HOVER_BACKGROUND_CSS = rgba(ICON_HOVER_BACKGROUND)
