// App.tsx
// Root component. Routes to either the settings panel or the floating companion,
// depending on the ?companion=true query parameter.
// In demo mode, the companion is the primary UI. The panel only opens for settings.

import React, { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { SettingsScreen } from './screens/SettingsScreen'
import { CompanionApp } from './companion/CompanionApp'

// Check if this renderer instance is the companion window
const isCompanionMode = new URLSearchParams(window.location.search).get('companion') === 'true'

// Apply companion-mode class to body so CSS can make it transparent
if (isCompanionMode) {
  document.body.classList.add('companion-mode')
}

export function App(): React.ReactElement {
  if (isCompanionMode) {
    return <CompanionApp />
  }

  return <SettingsPanel />
}

function SettingsPanel(): React.ReactElement {
  const {
    setSettings,
    setSettingsAreLoaded,
  } = useAppStore()

  useEffect(() => {
    async function loadPersistedState(): Promise<void> {
      try {
        const savedSettings = await window.buildy.loadSettings()
        setSettings(savedSettings)
        setSettingsAreLoaded(true)
      } catch (error) {
        console.error('Failed to load settings:', error)
        setSettingsAreLoaded(true)
      }
    }
    loadPersistedState()
  }, [])

  return (
    <div className="app-root">
      <div style={{ padding: '16px 0 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <h1 style={{ margin: 0, padding: '0 20px 12px', fontSize: 16, fontWeight: 600, color: 'rgba(255,255,255,0.9)' }}>
          Buildy Settings
        </h1>
      </div>
      <div className="screen-content">
        <SettingsScreen />
      </div>
    </div>
  )
}
