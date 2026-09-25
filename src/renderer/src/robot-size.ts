// robot-size.ts — pure: the robot's size (a zoom factor for the whole robot
// window — robot, bar, icons and "Next:" line scale together and stay sharp).
// Shared by main (companion-window.ts, robot-prefs.ts) and Settings.

export type RobotSizeName = 'small' | 'medium' | 'large'

export const ROBOT_SIZES: Record<RobotSizeName, number> = {
  small: 0.85,
  medium: 1, // today's size
  large: 1.5,
}

export const ROBOT_SIZE_LABELS: Record<RobotSizeName, string> = {
  small: 'Small',
  medium: 'Medium',
  large: 'Large',
}

/** Ctrl/Cmd + scroll wheel over the robot: steps of 10%, within these limits. */
export const ROBOT_ZOOM_STEP = 0.1
export const ROBOT_MIN_SCALE = 0.8
export const ROBOT_MAX_SCALE = 1.6

/** The robot window's size at scale 1 (companion-window.ts): wide enough for the
 *  whole toolbar (up to ten buttons with Hide and Quit), 300px tall as before. */
export const ROBOT_BASE_WIDTH = 340
export const ROBOT_BASE_HEIGHT = 300

export function clampRobotScale(scale: unknown): number {
  const n = typeof scale === 'number' && Number.isFinite(scale) ? scale : 1
  return Math.round(Math.min(ROBOT_MAX_SCALE, Math.max(ROBOT_MIN_SCALE, n)) * 100) / 100
}

/** One wheel notch: bigger (up) or smaller (down). */
export function zoomedRobotScale(current: number, direction: 'in' | 'out'): number {
  return clampRobotScale(current + (direction === 'in' ? ROBOT_ZOOM_STEP : -ROBOT_ZOOM_STEP))
}

/** Which preset this scale is, if any. */
export function robotSizeName(scale: number): RobotSizeName | null {
  const hit = (Object.keys(ROBOT_SIZES) as RobotSizeName[]).find((k) => Math.abs(ROBOT_SIZES[k] - scale) < 0.005)
  return hit ?? null
}

/** "Robot size: Large" / "Robot size: 120%" — shown briefly while zooming. */
export function robotSizeText(scale: number): string {
  const name = robotSizeName(scale)
  return name ? `Robot size: ${ROBOT_SIZE_LABELS[name]}` : `Robot size: ${Math.round(scale * 100)}%`
}

/** The robot window's pixel size at a scale. */
export function robotWindowSize(scale: number): { width: number; height: number } {
  const s = clampRobotScale(scale)
  return { width: Math.round(ROBOT_BASE_WIDTH * s), height: Math.round(ROBOT_BASE_HEIGHT * s) }
}
