// Mascot.tsx
// Buildy's character mascot. Renders one of five PNG poses with a soft, state-colored
// glow, a constant gentle breathing float, and per-state effects (thinking dots,
// speaking ripples, listening pings). Replaces the old generic glowing orb.
//
// Visual only — it takes a `state` and renders accordingly. No app logic lives here.

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

import idleImg from '../assets/buildy-idle.png'
import watchingImg from '../assets/buildy-watching.png'
import thinkingImg from '../assets/buildy-thinking.png'
import speakingImg from '../assets/buildy-speaking.png'

export type MascotState = 'idle' | 'watching' | 'thinking' | 'speaking' | 'listening'

interface Props {
  state: MascotState
  size?: number
}

// Pose PNG per state. `listening` reuses the idle pose but with a different glow.
const POSE: Record<MascotState, string> = {
  idle: idleImg,
  watching: watchingImg,
  thinking: thinkingImg,
  speaking: speakingImg,
  listening: idleImg,
}

// Glow color per state.
const GLOW: Record<MascotState, string> = {
  idle: '#F59E0B',      // warm orange
  watching: '#10B981',  // green
  thinking: '#8B5CF6',  // purple
  speaking: '#FFFFFF',  // white
  listening: '#FB7185', // pink
}

export function Mascot({ state, size = 220 }: Props): React.ReactElement {
  const poseSrc = POSE[state]
  const glow = GLOW[state]
  const blurNear = Math.round(size * 0.05)
  const blurFar = Math.round(size * 0.11)
  const dot = Math.max(5, Math.round(size * 0.05))

  return (
    <div style={{ ...styles.wrap, width: size, height: size }}>
      {/* Breathing float — gentle up/down oscillation, always on */}
      <motion.div
        style={styles.floatBox}
        animate={{ y: [0, -4, 0] }}
        transition={{ duration: 3, ease: 'easeInOut', repeat: Infinity }}
      >
        {/* Speaking — expanding ripple rings emanating outward (behind the mascot) */}
        {state === 'speaking' &&
          [0, 1, 2].map((i) => (
            <span
              key={`ripple-${i}`}
              className="mascot-ripple"
              style={{ borderColor: glow, animationDelay: `${i * 0.5}s` }}
            />
          ))}

        {/* Listening — expanding ping rings (behind the mascot) */}
        {state === 'listening' &&
          [0, 1, 2].map((i) => (
            <span
              key={`ping-${i}`}
              className="mascot-ping"
              style={{ borderColor: glow, animationDelay: `${i * 0.4}s` }}
            />
          ))}

        {/* Crossfade between poses — both images overlap during the 300ms fade */}
        <AnimatePresence initial={false}>
          <motion.img
            key={poseSrc}
            src={poseSrc}
            alt="Buildy"
            draggable={false}
            style={{
              ...styles.img,
              // Colored state glow + a dark depth shadow so the mascot stands out
              // when floating transparently on any desktop background.
              filter: `drop-shadow(0 0 ${blurNear}px ${glow}) drop-shadow(0 0 ${blurFar}px ${glow}) drop-shadow(0 4px 20px rgba(0,0,0,0.4))`,
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          />
        </AnimatePresence>

        {/* Thinking — three small bouncing dots above the head */}
        {state === 'thinking' && (
          <div style={{ ...styles.dotsRow, gap: Math.round(size * 0.035) }}>
            {[0, 1, 2].map((i) => (
              <span
                key={`dot-${i}`}
                className="mascot-dot"
                style={{
                  width: dot,
                  height: dot,
                  background: glow,
                  animationDelay: `${i * 0.16}s`,
                }}
              />
            ))}
          </div>
        )}
      </motion.div>

      <style>{`
        .mascot-dot {
          display: inline-block;
          border-radius: 50%;
          animation: mascotDotBounce 1.2s ease-in-out infinite;
        }
        .mascot-ripple,
        .mascot-ping {
          position: absolute;
          top: 50%;
          left: 50%;
          width: 76%;
          height: 76%;
          border-radius: 50%;
          border: 2px solid;
          box-sizing: border-box;
          pointer-events: none;
        }
        .mascot-ripple {
          animation: mascotRipple 1.6s ease-out infinite;
        }
        .mascot-ping {
          animation: mascotPing 1.4s cubic-bezier(0, 0, 0.2, 1) infinite;
        }
        @keyframes mascotDotBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
          40% { transform: translateY(-90%); opacity: 1; }
        }
        @keyframes mascotRipple {
          0% { transform: translate(-50%, -50%) scale(0.55); opacity: 0.55; }
          100% { transform: translate(-50%, -50%) scale(1.5); opacity: 0; }
        }
        @keyframes mascotPing {
          0% { transform: translate(-50%, -50%) scale(0.5); opacity: 0.7; }
          80%, 100% { transform: translate(-50%, -50%) scale(1.7); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  wrap: {
    position: 'relative' as const,
    background: 'transparent',
    flexShrink: 0,
    userSelect: 'none' as const,
  },
  floatBox: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  img: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    pointerEvents: 'none' as const,
  },
  dotsRow: {
    position: 'absolute' as const,
    top: '3%',
    left: '50%',
    transform: 'translateX(-50%)',
    display: 'flex',
    alignItems: 'flex-end',
    pointerEvents: 'none' as const,
  },
}
