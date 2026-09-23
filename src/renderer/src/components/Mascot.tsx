// Mascot.tsx
// Buildy's character mascot. Renders one of five PNG poses with a soft,
// state-colored glow layer, gentle idle motion (breathing + float + occasional
// look-around), per-state effects (orbiting thinking dots, speaking bounce +
// ripples, listening pings), and one-shot event reactions (hop + sparkles,
// hop + red pulse + "!" badge, nod, amber alert).
//
// Visual only — it takes props and renders accordingly. No app logic lives here.
//
// Performance rules:
//   - Animate transform/opacity ONLY (glow is an opacity-composited gradient
//     layer, not an animated filter).
//   - prefers-reduced-motion: pose crossfades only — no breathing, look-around,
//     hops, bounces or orbits.

import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence, useReducedMotion, useAnimationControls } from 'framer-motion'

import idleImg from '../assets/buildy-idle.png'
import watchingImg from '../assets/buildy-watching.png'
import thinkingImg from '../assets/buildy-thinking.png'
import speakingImg from '../assets/buildy-speaking.png'

export type MascotState = 'idle' | 'watching' | 'thinking' | 'speaking' | 'listening'

// Goal alignment drives the glow color while watching.
export type MascotAlignment = 'on-track' | 'drift' | 'blocked'

// One-shot event reactions. `id` must change on every new event so the same
// reaction type can replay (e.g. two successes in a row).
export type MascotReactionType = 'success' | 'blocked' | 'sent' | 'permission'
export interface MascotReaction {
  type: MascotReactionType
  id: number
}

interface Props {
  state: MascotState
  size?: number
  /** Colors the watching glow: on-track green, drift amber, blocked red. */
  alignment?: MascotAlignment | null
  /** One-shot reaction; replayed whenever `id` changes. */
  reaction?: MascotReaction | null
  /** Persistent "!" badge (blocked / hand-off) until guidance is opened. */
  showAlertBadge?: boolean
  /** True while the window is being dragged — slight squash. */
  dragging?: boolean
}

// Pose PNG per state. `listening` reuses the idle pose but with a different glow.
const POSE: Record<MascotState, string> = {
  idle: idleImg,
  watching: watchingImg,
  thinking: thinkingImg,
  speaking: speakingImg,
  listening: idleImg,
}

// Glow color per state (watching is overridden by alignment).
const GLOW: Record<MascotState, string> = {
  idle: '#F59E0B',      // warm orange
  watching: '#10B981',  // green (ON TRACK default)
  thinking: '#8B5CF6',  // purple
  speaking: '#FFFFFF',  // white
  listening: '#FB7185', // pink
}

const ALIGNMENT_GLOW: Record<MascotAlignment, string> = {
  'on-track': '#10B981', // green
  drift: '#F59E0B',      // amber
  blocked: '#EF4444',    // red
}

export function Mascot({
  state,
  size = 220,
  alignment = null,
  reaction = null,
  showAlertBadge = false,
  dragging = false,
}: Props): React.ReactElement {
  const reducedMotion = useReducedMotion() ?? false
  const [hovered, setHovered] = useState(false)

  const poseSrc = POSE[state]
  const glow = state === 'watching' && alignment ? ALIGNMENT_GLOW[alignment] : GLOW[state]
  const dot = Math.max(5, Math.round(size * 0.05))

  // ─── Idle look-around: every 8–14s a small tilt + shift, then back ────────
  const [glance, setGlance] = useState({ rotate: 0, x: 0 })
  useEffect(() => {
    if (state !== 'idle' || reducedMotion) {
      setGlance({ rotate: 0, x: 0 })
      return
    }
    let lookTimer: ReturnType<typeof setTimeout>
    let backTimer: ReturnType<typeof setTimeout>
    const schedule = (): void => {
      lookTimer = setTimeout(() => {
        const dir = Math.random() < 0.5 ? -1 : 1
        setGlance({
          rotate: dir * (2 + Math.random() * 2),   // up to 4deg
          x: dir * (2 + Math.random() * 3),        // a few px
        })
        backTimer = setTimeout(() => {
          setGlance({ rotate: 0, x: 0 })
          schedule()
        }, 1100)
      }, 8000 + Math.random() * 6000)               // 8–14s, randomized
    }
    schedule()
    return () => { clearTimeout(lookTimer); clearTimeout(backTimer) }
  }, [state, reducedMotion])

  // ─── One-shot reactions (hop / nod), replayed on every new reaction id ────
  const hopControls = useAnimationControls()
  const [burst, setBurst] = useState<MascotReaction | null>(null)
  useEffect(() => {
    if (!reaction) return
    // Overlay visuals (sparkles / pulse rings) live briefly, then unmount.
    setBurst(reaction)
    const clear = setTimeout(() => setBurst(null), 1600)
    if (!reducedMotion) {
      if (reaction.type === 'success' || reaction.type === 'blocked') {
        // Hop: up, land, small second bounce.
        hopControls.start({
          y: [0, -Math.round(size * 0.09), 0, -Math.round(size * 0.03), 0],
          transition: { duration: 0.65, ease: 'easeOut', times: [0, 0.32, 0.6, 0.8, 1] },
        })
      } else if (reaction.type === 'sent') {
        // Quick nod: brief forward tilt and back.
        hopControls.start({
          rotate: [0, 9, -2, 0],
          transition: { duration: 0.5, ease: 'easeInOut' },
        })
      }
    }
    return () => clearTimeout(clear)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reaction?.id])

  // ─── Per-layer animation targets (all transform/opacity) ─────────────────
  const anim = !reducedMotion

  // Hover lift + drag squash (outermost so it composes with everything).
  const liftY = anim && hovered && !dragging ? -Math.round(size * 0.03) : 0
  const squash = anim && dragging
    ? { scaleX: 1.05, scaleY: 0.93 }
    : { scaleX: 1, scaleY: 1 }

  // Speaking bounce / thinking head tilt.
  const stateAnim =
    anim && state === 'speaking' ? { y: [0, -Math.round(size * 0.035), 0], rotate: 0 }
    : anim && state === 'thinking' ? { y: 0, rotate: -5 }
    : { y: 0, rotate: 0 }
  const stateTransition =
    anim && state === 'speaking'
      ? { duration: 0.5, ease: 'easeInOut' as const, repeat: Infinity }
      : { type: 'spring' as const, stiffness: 220, damping: 18 }

  // Thinking-dot orbit geometry.
  const orbitD = Math.round(size * 0.3)
  const orbitR = Math.round(orbitD / 2)

  return (
    <div
      style={{ ...styles.wrap, width: size, height: size }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Glow — opacity-composited radial gradient layer (no animated filters).
          Crossfades between colors; brightens on hover. */}
      <AnimatePresence initial={false}>
        <motion.div
          key={glow}
          style={{
            ...styles.glow,
            background: `radial-gradient(circle, ${glow}66 0%, ${glow}2E 45%, transparent 70%)`,
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: hovered ? 0.95 : 0.65 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4, ease: 'easeInOut' }}
        />
      </AnimatePresence>

      {/* Hover lift + drag squash */}
      <motion.div
        style={styles.layer}
        animate={{ y: liftY, ...squash }}
        transition={{ type: 'spring', stiffness: 300, damping: 22 }}
      >
        {/* Float — gentle up/down oscillation */}
        <motion.div
          style={styles.layer}
          animate={anim ? { y: [0, -4, 0] } : { y: 0 }}
          transition={anim ? { duration: 3, ease: 'easeInOut', repeat: Infinity } : undefined}
        >
          {/* Breathing — slow scale swell, idle only */}
          <motion.div
            style={styles.layer}
            animate={anim && state === 'idle' ? { scale: [1, 1.015, 1] } : { scale: 1 }}
            transition={
              anim && state === 'idle'
                ? { duration: 4.2, ease: 'easeInOut', repeat: Infinity }
                : undefined
            }
          >
            {/* Look-around — occasional small tilt + shift, idle only */}
            <motion.div
              style={styles.layer}
              animate={{ rotate: glance.rotate, x: glance.x }}
              transition={{ type: 'spring', stiffness: 120, damping: 14 }}
            >
              {/* Speaking bounce / thinking tilt */}
              <motion.div style={styles.layer} animate={stateAnim} transition={stateTransition}>
                {/* One-shot hop / nod reactions */}
                <motion.div style={styles.layer} animate={hopControls}>
                  {/* Speaking — expanding ripple rings (behind the mascot) */}
                  {anim && state === 'speaking' &&
                    [0, 1, 2].map((i) => (
                      <span
                        key={`ripple-${i}`}
                        className="mascot-ripple"
                        style={{ borderColor: glow, animationDelay: `${i * 0.5}s` }}
                      />
                    ))}

                  {/* Listening — expanding ping rings (behind the mascot) */}
                  {anim && state === 'listening' &&
                    [0, 1, 2].map((i) => (
                      <span
                        key={`ping-${i}`}
                        className="mascot-ping"
                        style={{ borderColor: glow, animationDelay: `${i * 0.4}s` }}
                      />
                    ))}

                  {/* Crossfade + small scale pop between poses — never a hard swap */}
                  <AnimatePresence initial={false}>
                    <motion.img
                      key={poseSrc}
                      src={poseSrc}
                      alt="Buildy"
                      draggable={false}
                      style={styles.img}
                      initial={{ opacity: 0, scale: reducedMotion ? 1 : 0.92 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: 'easeInOut' }}
                    />
                  </AnimatePresence>

                  {/* Thinking — three dots orbiting above the head */}
                  {state === 'thinking' && (
                    <div
                      style={{
                        ...styles.orbitBox,
                        width: orbitD,
                        height: orbitD,
                        marginLeft: -orbitR,
                      }}
                    >
                      <motion.div
                        style={styles.layer}
                        animate={anim ? { rotate: 360 } : { rotate: 0 }}
                        transition={
                          anim ? { duration: 2.6, ease: 'linear', repeat: Infinity } : undefined
                        }
                      >
                        {[0, 1, 2].map((i) => (
                          <span
                            key={`dot-${i}`}
                            style={{
                              ...styles.orbitDot,
                              width: dot,
                              height: dot,
                              marginTop: -dot / 2,
                              marginLeft: -dot / 2,
                              background: glow,
                              transform: `rotate(${i * 120}deg) translateX(${orbitR - dot / 2}px)`,
                            }}
                          />
                        ))}
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              </motion.div>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>

      {/* Success — short sparkle burst radiating outward */}
      {!reducedMotion && burst?.type === 'success' && (
        <div key={`sparkle-${burst.id}`} style={styles.overlayCenter}>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const angle = (i / 6) * Math.PI * 2
            const r = size * 0.42
            return (
              <motion.span
                key={i}
                style={{ ...styles.sparkle, width: dot, height: dot }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0.4 }}
                animate={{
                  x: Math.cos(angle) * r,
                  y: Math.sin(angle) * r,
                  opacity: 0,
                  scale: 1,
                }}
                transition={{ duration: 0.7, ease: 'easeOut' }}
              />
            )
          })}
        </div>
      )}

      {/* Blocked / hand-off — red pulse ring; permission prompt — amber alert ring */}
      {!reducedMotion && (burst?.type === 'blocked' || burst?.type === 'permission') && (
        <div key={`ring-${burst.id}`} style={styles.overlayCenter}>
          {[0, 1].map((i) => (
            <motion.span
              key={i}
              style={{
                ...styles.pulseRing,
                width: size * 0.8,
                height: size * 0.8,
                borderColor: burst.type === 'blocked' ? '#EF4444' : '#F59E0B',
              }}
              initial={{ scale: 0.65, opacity: 0.85 }}
              animate={{ scale: 1.45, opacity: 0 }}
              transition={{ duration: 0.75, ease: 'easeOut', delay: i * 0.3 }}
            />
          ))}
        </div>
      )}

      {/* "!" badge — persists until the guidance panel is opened */}
      <AnimatePresence>
        {showAlertBadge && (
          <motion.div
            style={{
              ...styles.badge,
              width: Math.round(size * 0.17),
              height: Math.round(size * 0.17),
              fontSize: Math.round(size * 0.11),
            }}
            initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.3 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: reducedMotion ? 1 : 0.3 }}
            transition={{ type: 'spring', stiffness: 400, damping: 20 }}
          >
            !
          </motion.div>
        )}
      </AnimatePresence>

      <style>{`
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
  // Generic full-size animation layer — each layer animates ONE thing.
  layer: {
    position: 'relative' as const,
    width: '100%',
    height: '100%',
  },
  glow: {
    position: 'absolute' as const,
    inset: '-8%',
    borderRadius: '50%',
    pointerEvents: 'none' as const,
  },
  img: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'contain' as const,
    pointerEvents: 'none' as const,
    // Static depth shadow only (never animated) — colored glow is the gradient layer.
    filter: 'drop-shadow(0 4px 14px rgba(0,0,0,0.4))',
  },
  orbitBox: {
    position: 'absolute' as const,
    top: '-4%',
    left: '50%',
    pointerEvents: 'none' as const,
  },
  orbitDot: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    borderRadius: '50%',
    display: 'block',
  },
  overlayCenter: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    width: 0,
    height: 0,
    pointerEvents: 'none' as const,
  },
  sparkle: {
    position: 'absolute' as const,
    top: 0,
    left: 0,
    borderRadius: '50%',
    background: '#FCD34D',
    boxShadow: '0 0 6px #FCD34D',
    display: 'block',
  },
  pulseRing: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    translate: '-50% -50%',
    borderRadius: '50%',
    border: '2.5px solid',
    boxSizing: 'border-box' as const,
    display: 'block',
  },
  badge: {
    position: 'absolute' as const,
    top: '4%',
    right: '8%',
    borderRadius: '50%',
    background: '#EF4444',
    color: '#fff',
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    lineHeight: 1,
    pointerEvents: 'none' as const,
    boxShadow: '0 2px 8px rgba(0,0,0,0.35)',
  },
}
