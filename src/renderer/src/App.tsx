// App.tsx
// Root component. Loads persistent state on startup, then renders
// the correct screen based on the Zustand store's currentScreen.

import React, { useEffect } from 'react'
import { useAppStore } from './store/useAppStore'
import { NavBar } from './components/NavBar'
import { BrainstormScreen } from './screens/BrainstormScreen'
import { GuidanceWorkspace } from './screens/GuidanceWorkspace'
import { MemoryScreen } from './screens/MemoryScreen'
import { SettingsScreen } from './screens/SettingsScreen'

export function App(): React.ReactElement {
  const {
    currentScreen,
    setProject,
    setProjectIsLoaded,
    setSettings,
    setSettingsAreLoaded,
    project,
  } = useAppStore()

  // Load persisted project and settings from disk on first render
  useEffect(() => {
    async function loadPersistedState(): Promise<void> {
      try {
        const [savedProject, savedSettings] = await Promise.all([
          window.buildy.loadProject(),
          window.buildy.loadSettings(),
        ])
        setProject(savedProject)
        setProjectIsLoaded(true)
        setSettings(savedSettings)
        setSettingsAreLoaded(true)
      } catch (error) {
        console.error('Failed to load persisted state:', error)
        setProjectIsLoaded(true)
        setSettingsAreLoaded(true)
      }
    }

    loadPersistedState()
  }, [])

  return (
    <div className="app-root">
      <NavBar />
      <div className="screen-content">
        {currentScreen === 'brainstorm' && <BrainstormScreen />}
        {currentScreen === 'guidance'   && <GuidanceWorkspace />}
        {currentScreen === 'memory'     && <MemoryScreen />}
        {currentScreen === 'settings'   && <SettingsScreen />}
      </div>
    </div>
  )
}
