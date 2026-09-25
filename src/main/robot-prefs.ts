// robot-prefs.ts — main process. Remembers the robot's size across launches
// in <userData>/robot-prefs.json (Delete all data removes it).

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { clampRobotScale } from '../renderer/src/robot-size'

export const ROBOT_PREFS_FILE = 'robot-prefs.json'

export function loadRobotScale(userDataDir: string): number {
  try {
    const raw = JSON.parse(readFileSync(join(userDataDir, ROBOT_PREFS_FILE), 'utf8')) as { scale?: unknown }
    return clampRobotScale(raw.scale)
  } catch {
    return 1 // Medium — today's size
  }
}

export function saveRobotScale(userDataDir: string, scale: number): void {
  mkdirSync(userDataDir, { recursive: true })
  writeFileSync(join(userDataDir, ROBOT_PREFS_FILE), JSON.stringify({ scale: clampRobotScale(scale) }), 'utf8')
}
