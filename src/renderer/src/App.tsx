// App.tsx
// Root component. Routes to either the main settings/workspace panel or the
// floating companion, depending on the ?companion=true query parameter.
//
// The panel is a multi-screen workspace (NavBar + screens). On first launch it
// opens the Goal screen so the user states their purpose before anything else.

import React, { useEffect, useState } from 'react'
import { useAppStore } from './store/useAppStore'
import { NavBar } from './components/NavBar'
import { GoalScreen } from './screens/GoalScreen'
import { BrainstormScreen } from './screens/BrainstormScreen'
import { GuidanceWorkspace } from './screens/GuidanceWorkspace'
import { MemoryScreen } from './screens/MemoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'
import { CompanionApp } from './companion/CompanionApp'
import { GuidancePanel } from './guidance/GuidancePanel'
import { VoicePlayer } from './voice/VoicePlayer'

// Which window is this renderer instance? Routed via query parameter.
const params = new URLSearchParams(window.location.search)
const isCompanionMode = params.get('companion') === 'true'
const isGuidanceMode = params.get('guidance') === 'true'
const isVoiceMode = params.get('voice') === 'true'

// Both floating windows are fully transparent — flag the document so CSS strips
// the background.
if (isCompanionMode) {
  document.documentElement.classList.add('companion-mode')
  document.body.classList.add('companion-mode')
}
if (isGuidanceMode) {
  document.documentElement.classList.add('guidance-mode')
  document.body.classList.add('guidance-mode')
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export function App(): React.ReactElement | null {
  if (isVoiceMode) {
    return <VoicePlayer />
  }

  if (isGuidanceMode) {
    return <GuidancePanel />
  }

  if (isCompanionMode) {
    return <CompanionApp />
  }

  return <MainPanel />
}

function MainPanel(): React.ReactElement {
  const {
    currentScreen,
    setCurrentScreen,
    setSettings,
    setSettingsAreLoaded,
    setProject,
    setProjectIsLoaded,
    patchProject,
  } = useAppStore()

  const [goalNudgeVisible, setGoalNudgeVisible] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function loadPersistedState(): Promise<void> {
      try {
        const [savedSettings, savedProject] = await Promise.all([
          window.buildy.loadSettings(),
          window.buildy.loadProject(),
        ])
        if (cancelled) return

        setSettings(savedSettings)
        setSettingsAreLoaded(true)
        setProject(savedProject)
        setProjectIsLoaded(true)

        // First launch (goal never set or skipped) → show the Goal screen first.
        if (!savedProject.goalPromptSeen && !savedProject.goal) {
          setCurrentScreen('goal')
          return
        }

        // Otherwise land on the main workspace.
        setCurrentScreen('guidance')

        // Gentle review nudge if the goal hasn't been looked at in over a week.
        const reviewedAt = savedProject.goal?.lastReviewedAt
        if (
          savedProject.goal &&
          reviewedAt &&
          Date.now() - new Date(reviewedAt).getTime() > SEVEN_DAYS_MS
        ) {
          setGoalNudgeVisible(true)
        }
      } catch (error) {
        console.error('Failed to load persisted state:', error)
        if (cancelled) return
        setSettingsAreLoaded(true)
        setProjectIsLoaded(true)
      }
    }
    loadPersistedState()
    return () => { cancelled = true }
  }, [])

  function handleReviewGoal(): void {
    setGoalNudgeVisible(false)
    setCurrentScreen('goal')
  }

  async function handleGoalLooksGood(): Promise<void> {
    setGoalNudgeVisible(false)
    try {
      const updated = await window.buildy.goal.update({ lastReviewedAt: new Date().toISOString() })
      if (updated) patchProject({ goal: updated })
    } catch (error) {
      console.warn('Failed to update goal review time:', error)
    }
  }

  return (
    <div className="app-root">
      <NavBar />
      <div className="screen-content">
        {currentScreen === 'goal' && <GoalScreen />}
        {currentScreen === 'brainstorm' && <BrainstormScreen />}
        {currentScreen === 'guidance' && <GuidanceWorkspace />}
        {currentScreen === 'memory' && <MemoryScreen />}
        {currentScreen === 'settings' && <SettingsScreen />}
      </div>

      {goalNudgeVisible && (
        <GoalReviewNudge onReview={handleReviewGoal} onLooksGood={handleGoalLooksGood} />
      )}
    </div>
  )
}

// ─── Goal review nudge (REQ 6) ────────────────────────────────────────────────

function GoalReviewNudge({
  onReview,
  onLooksGood,
}: {
  onReview: () => void
  onLooksGood: () => void
}): React.ReactElement {
  return (
    <div style={nudgeStyles.overlay}>
      <div style={nudgeStyles.card}>
        <div style={nudgeStyles.icon}>🎯</div>
        <div style={nudgeStyles.text}>
          It has been a week since you last looked at your goal. Take 10 seconds to review it?
        </div>
        <div style={nudgeStyles.buttons}>
          <button className="btn-primary" onClick={onReview} style={{ flex: 1, justifyContent: 'center' }}>
            Review goal
          </button>
          <button className="btn-ghost" onClick={onLooksGood} style={{ flex: 1, justifyContent: 'center' }}>
            Looks good
          </button>
        </div>
      </div>
    </div>
  )
}

const nudgeStyles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    padding: 24,
  },
  card: {
    background: 'var(--color-surface)',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-lg)',
    padding: 20,
    maxWidth: 340,
    width: '100%',
    textAlign: 'center' as const,
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  },
  icon: {
    fontSize: 28,
    marginBottom: 8,
  },
  text: {
    fontSize: 14,
    color: 'var(--color-text)',
    lineHeight: 1.5,
    marginBottom: 16,
  },
  buttons: {
    display: 'flex',
    gap: 8,
  },
}
