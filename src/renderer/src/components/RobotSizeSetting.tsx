// RobotSizeSetting.tsx — Settings → "Robot size": Small, Medium (today's
// size) or Large (1.5×). Scales the robot, its bar, icons and text together;
// remembered across launches (main: robot-prefs.ts). Ctrl/Cmd + scroll over
// the robot also zooms it — the choice here follows that.

import React, { useEffect, useState } from 'react'
import { ROBOT_SIZES, ROBOT_SIZE_LABELS, robotSizeName, type RobotSizeName } from '../robot-size'

export function RobotSizeSetting(): React.ReactElement {
  const [scale, setScale] = useState<number | null>(null)

  useEffect(() => {
    void window.mybuildy.robot.getScale().then(setScale)
    return window.mybuildy.robot.onScaleChanged(setScale)
  }, [])

  const current = scale === null ? null : robotSizeName(scale)

  return (
    <div role="radiogroup" aria-label="Robot size" style={S.row}>
      {(Object.keys(ROBOT_SIZES) as RobotSizeName[]).map((name) => {
        const on = current === name
        return (
          <button
            key={name}
            type="button"
            role="radio"
            aria-checked={on}
            className={on ? 'btn-primary' : 'btn-secondary'}
            style={S.option}
            onClick={() => { void window.mybuildy.robot.setScale(ROBOT_SIZES[name]).then(setScale) }}
          >
            {ROBOT_SIZE_LABELS[name]}
          </button>
        )
      })}
      {scale !== null && !current && <span style={S.custom}>Custom ({Math.round(scale * 100)}%)</span>}
    </div>
  )
}

const S = {
  row: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' as const },
  option: { minWidth: 76, justifyContent: 'center' },
  custom: { fontSize: 12, color: 'var(--color-text-dim)' },
}
