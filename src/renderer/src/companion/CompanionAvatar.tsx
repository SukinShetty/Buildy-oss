// CompanionAvatar.tsx
// Glowing orb assistant visual.
// States: idle (slow breathe), thinking (faster pulse + orange), speaking (ripple rings).

import React from 'react'
import type { CompanionState } from '../store/useCompanionStore'

interface Props {
  state: CompanionState
  onClick: () => void
  onContextMenu: () => void
}

export function CompanionAvatar({ state, onClick, onContextMenu }: Props): React.ReactElement {
  return (
    <div
      style={styles.container}
      onClick={onClick}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu() }}
    >
      {/* Ripple rings — visible when speaking */}
      {state === 'speaking' && (
        <>
          <div style={styles.ripple} className="orb-ripple orb-ripple-1" />
          <div style={styles.ripple} className="orb-ripple orb-ripple-2" />
        </>
      )}

      {/* Ambient glow */}
      <div
        style={{
          ...styles.ambientGlow,
          ...(state === 'thinking' ? styles.glowThinking : {}),
          ...(state === 'speaking' ? styles.glowSpeaking : {}),
        }}
        className={state === 'idle' ? 'glow-breathe' : state === 'thinking' ? 'glow-pulse-fast' : ''}
      />

      {/* Core orb */}
      <div
        style={styles.orb}
        className={state === 'idle' ? 'orb-breathe' : state === 'thinking' ? 'orb-pulse' : 'orb-speak'}
      >
        {/* Inner highlight */}
        <div style={styles.orbHighlight} />
        {/* Center dot */}
        <div style={styles.orbCenter} />
      </div>

      <style>{`
        .orb-breathe {
          animation: orbBreathe 4s ease-in-out infinite;
        }
        .orb-pulse {
          animation: orbPulse 1.5s ease-in-out infinite;
        }
        .orb-speak {
          animation: orbSpeak 0.8s ease-in-out infinite;
        }
        .glow-breathe {
          animation: glowBreathe 4s ease-in-out infinite;
        }
        .glow-pulse-fast {
          animation: glowPulseFast 1.5s ease-in-out infinite;
        }
        .orb-ripple {
          position: absolute;
          border-radius: 50%;
          border: 1.5px solid rgba(255, 107, 43, 0.3);
          pointer-events: none;
        }
        .orb-ripple-1 {
          width: 96px; height: 96px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%) scale(1);
          animation: rippleExpand 1.5s ease-out infinite;
        }
        .orb-ripple-2 {
          width: 96px; height: 96px;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%) scale(1);
          animation: rippleExpand 1.5s ease-out infinite 0.5s;
        }

        @keyframes orbBreathe {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.04); }
        }
        @keyframes orbPulse {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.08); }
        }
        @keyframes orbSpeak {
          0%, 100% { transform: scale(1); }
          30% { transform: scale(1.06); }
          60% { transform: scale(0.97); }
        }
        @keyframes glowBreathe {
          0%, 100% { opacity: 0.4; transform: scale(1); }
          50% { opacity: 0.65; transform: scale(1.05); }
        }
        @keyframes glowPulseFast {
          0%, 100% { opacity: 0.5; transform: scale(1); }
          50% { opacity: 0.9; transform: scale(1.12); }
        }
        @keyframes rippleExpand {
          0% { transform: translate(-50%, -50%) scale(0.8); opacity: 0.6; }
          100% { transform: translate(-50%, -50%) scale(1.8); opacity: 0; }
        }
      `}</style>
    </div>
  )
}

const styles = {
  container: {
    position: 'relative' as const,
    width: 96,
    height: 96,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  ambientGlow: {
    position: 'absolute' as const,
    width: 96,
    height: 96,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(255,107,43,0.3) 0%, rgba(255,107,43,0.08) 55%, transparent 80%)',
    pointerEvents: 'none' as const,
  },
  glowThinking: {
    background: 'radial-gradient(circle, rgba(255,140,50,0.4) 0%, rgba(255,107,43,0.1) 60%, transparent 80%)',
  },
  glowSpeaking: {
    background: 'radial-gradient(circle, rgba(255,107,43,0.5) 0%, rgba(255,107,43,0.15) 60%, transparent 80%)',
  },
  orb: {
    width: 64,
    height: 64,
    borderRadius: '50%',
    background: 'linear-gradient(145deg, #FF8C42 0%, #FF6B2B 45%, #E04E1A 100%)',
    boxShadow: '0 4px 24px rgba(255,107,43,0.4), inset 0 2px 3px rgba(255,255,255,0.2)',
    position: 'relative' as const,
    overflow: 'hidden',
  },
  orbHighlight: {
    position: 'absolute' as const,
    top: 8,
    left: 14,
    width: 24,
    height: 14,
    borderRadius: '50%',
    background: 'radial-gradient(ellipse, rgba(255,255,255,0.35) 0%, transparent 70%)',
    pointerEvents: 'none' as const,
  },
  orbCenter: {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: 10,
    height: 10,
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.5)',
    boxShadow: '0 0 8px rgba(255,255,255,0.3)',
  },
  ripple: {
    // positioned via className
  },
}
